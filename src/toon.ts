import {
  BackSide, Color, DataTexture, InstancedMesh, Mesh, MeshBasicMaterial, MeshToonMaterial, NearestFilter,
  RedFormat, type BufferGeometry, type IUniform, type Material,
} from 'three'

// Cel shading: three hard light steps, then an ink outline drawn as a slightly inflated back-face shell.

const ramp = new DataTexture(new Uint8Array([118, 180, 255]), 3, 1, RedFormat)
ramp.minFilter = NearestFilter
ramp.magFilter = NearestFilter
ramp.generateMipmaps = false
ramp.needsUpdate = true

export const INK = new Color(0x1e2a2c)

export function toon(opts: { color?: number; vertexColors?: boolean } = {}): MeshToonMaterial {
  return new MeshToonMaterial({ color: opts.color ?? 0xffffff, vertexColors: opts.vertexColors ?? false, gradientMap: ramp })
}

/** Toon material with painted-wood grain, in the object's own space so the grain rides with the toy. */
export function woodToon(): MeshToonMaterial {
  const m = toon({ vertexColors: true })
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float r = length(vObj.xy - vec2(0.11, 0.37)) + sin(vObj.z * 7.0 + vObj.y * 3.0) * 0.025;
        float grain = smoothstep(0.0, 0.18, abs(fract(r * 15.0) - 0.5));
        diffuseColor.rgb *= 0.9 + 0.1 * grain;`,
      )
  }
  return m
}


export function outlineMaterial(thick = 0.03): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ color: INK, side: BackSide })
  const u = { uThick: { value: thick } }
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uThick = u.uThick
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uThick;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uThick;')
  }
  m.customProgramCacheKey = () => `outline-${thick}`
  return m
}

/** Give a mesh its ink shell. The shell never casts shadows. */
export function inked(mesh: Mesh, thick = 0.03): Mesh {
  const shell = new Mesh(mesh.geometry, outlineMaterial(thick))
  shell.castShadow = false
  shell.receiveShadow = false
  mesh.add(shell)
  return shell
}

/** Ink shell for an instanced mesh: shares its instance matrices. */
export function inkedInstances(mesh: InstancedMesh, thick = 0.04): InstancedMesh {
  const shell = new InstancedMesh(mesh.geometry as BufferGeometry, outlineMaterial(thick) as Material, mesh.instanceMatrix.count)
  shell.instanceMatrix = mesh.instanceMatrix
  shell.castShadow = false
  shell.frustumCulled = false
  return shell
}
