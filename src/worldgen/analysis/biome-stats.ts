export interface BiomeStats {
  coverage: Record<number, number>     // biome -> fraction (0-1)
  regionCount: Record<number, number>  // biome -> number of distinct regions
  avgRegionSize: number
}

export function analyzeBiomeStats(biomeMap: Uint8Array, worldWidth: number, worldDepth: number): BiomeStats {
  const total = biomeMap.length

  // Coverage
  const counts: Record<number, number> = {}
  for (let i = 0; i < biomeMap.length; i++) {
    const b = biomeMap[i]
    counts[b] = (counts[b] ?? 0) + 1
  }
  const coverage: Record<number, number> = {}
  for (const [b, c] of Object.entries(counts)) {
    coverage[Number(b)] = c / total
  }

  // Region counting via flood fill
  const visited = new Uint8Array(total)
  const regionCount: Record<number, number> = {}
  let totalRegions = 0

  for (let x = 0; x < worldWidth; x++) {
    for (let z = 0; z < worldDepth; z++) {
      const idx = x * worldDepth + z
      if (visited[idx]) continue
      const biome = biomeMap[idx]
      regionCount[biome] = (regionCount[biome] ?? 0) + 1
      totalRegions++

      // Flood fill
      const stack = [idx]
      while (stack.length > 0) {
        const ci = stack.pop()!
        if (visited[ci]) continue
        visited[ci] = 1
        const cx = Math.floor(ci / worldDepth)
        const cz = ci % worldDepth
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = cx + dx, nz = cz + dz
          if (nx >= 0 && nx < worldWidth && nz >= 0 && nz < worldDepth) {
            const ni = nx * worldDepth + nz
            if (!visited[ni] && biomeMap[ni] === biome) {
              stack.push(ni)
            }
          }
        }
      }
    }
  }

  const avgRegionSize = totalRegions > 0 ? total / totalRegions : 0

  return { coverage, regionCount, avgRegionSize }
}
