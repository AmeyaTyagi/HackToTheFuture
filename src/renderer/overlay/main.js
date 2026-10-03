// Overlay backend surface: captures the screen and redraws every frame
// through a shader that applies Photon's color transform. The window this
// runs in is click-through and excluded from capture.

const canvas = document.getElementById('screen')
const video = document.getElementById('video')
const gl = canvas.getContext('webgl', { alpha: true, antialias: false, desynchronized: true })

const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`

const FRAGMENT = `
precision mediump float;
varying vec2 uv;
uniform sampler2D frame;
uniform mat3 matrix;
uniform vec3 offset;
void main() {
  vec3 color = texture2D(frame, uv).rgb;
  gl_FragColor = vec4(clamp(matrix * color + offset, 0.0, 1.0), 1.0);
}`

function compile(type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
  return shader
}

const program = gl.createProgram()
gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
gl.linkProgram(program)
gl.useProgram(program)

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
const position = gl.getAttribLocation(program, 'position')
gl.enableVertexAttribArray(position)
gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

let transform = null

window.photon?.on('overlay:transform', (next) => {
  transform = next
  const m = next.matrix
  // GLSL matrices are column-major; ours are row-major.
  gl.uniformMatrix3fv(gl.getUniformLocation(program, 'matrix'), false, [
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ])
  gl.uniform3fv(gl.getUniformLocation(program, 'offset'), next.offset)
})

function draw() {
  // Until a transform arrives the window stays transparent.
  if (transform && video.videoWidth) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  video.requestVideoFrameCallback(draw)
}

async function start() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60 } },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  video.requestVideoFrameCallback(draw)
}

start().catch((error) => console.error('Photon overlay could not capture the screen:', error))
