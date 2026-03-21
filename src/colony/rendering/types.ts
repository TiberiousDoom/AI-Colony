/**
 * Shared types for the rendering layer.
 */

/** Configuration for a single village renderer */
export interface VillageRendererConfig {
  villageId: string
  width: number       // Canvas width in pixels
  height: number      // Canvas height in pixels
  tileSize: number    // Rendered tile size in pixels (default: 16)
}

/** Camera state for pan/zoom */
export interface CameraState {
  x: number           // Camera center in world coordinates
  y: number           // Camera center in world coordinates
  zoom: number        // Zoom level (1.0 = 1 pixel per tile pixel)
  minZoom: number
  maxZoom: number
}

/** Which villager (if any) is selected in the inspector */
export interface InspectorSelection {
  villagerId: string
  villageId: string
}
