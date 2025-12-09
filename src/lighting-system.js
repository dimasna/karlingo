import { createComponent, createSystem } from '@iwsdk/core';

// Simple marker components (no schema needed)
export const DiscoBall = createComponent('DiscoBall', {});
export const AnimatedSpotlight = createComponent('AnimatedSpotlight', {});
export const DiscoFloorLight = createComponent('DiscoFloorLight', {});

// Party mode state
let partyMode = true;

export function setPartyMode(enabled) {
  partyMode = enabled;
}

export function getPartyMode() {
  return partyMode;
}

export class LightingSystem extends createSystem({
  discoBall: {
    required: [DiscoBall]
  },
  spotlights: {
    required: [AnimatedSpotlight]
  },
  floorLights: {
    required: [DiscoFloorLight]
  }
}) {
  init() {
    this.startTime = performance.now();
    // Store entity indices for animation offset
    this.spotlightIndices = new Map();
    this.floorLightIndices = new Map();
    console.log('LightingSystem: Initialized');
  }

  update() {
    const time = (performance.now() - this.startTime) * 0.001;

    // Rotate disco ball
    this.queries.discoBall.entities.forEach((entity) => {
      if (entity.object3D) {
        entity.object3D.rotation.y += 0.005;
      }
    });

    // Animate spotlights - color cycling, pulsing, and sweeping motion
    let spotIndex = 0;
    this.queries.spotlights.entities.forEach((entity) => {
      // Use entity index for animation offset
      if (!this.spotlightIndices.has(entity)) {
        this.spotlightIndices.set(entity, spotIndex);
      }
      const i = this.spotlightIndices.get(entity);
      spotIndex++;

      if (entity.object3D) {
        const light = entity.object3D;

        if (light.isSpotLight) {
          // Slower, smoother color transitions
          const hue = (time * 0.15 + i * 0.25) % 1;
          light.color.setHSL(hue, 0.9, 0.5);

          // Smooth pulsing intensity
          const pulse = Math.sin(time * 2 + i * Math.PI / 2);
          light.intensity = partyMode ? (40 + pulse * 15) : (25 + pulse * 10);

          // Rotating sweeping motion - spotlights follow floor pattern
          if (light.target) {
            const angle = time * 0.5 + i * (Math.PI / 2);
            const radius = 1.0 + Math.sin(time * 0.8 + i) * 0.3;
            light.target.position.x = Math.cos(angle) * radius;
            light.target.position.z = Math.sin(angle) * radius + 0.3;
            light.target.position.y = 0;
          }
        }
      }
    });

    // Animate disco floor lights (party mode only)
    if (partyMode) {
      let floorIndex = 0;
      this.queries.floorLights.entities.forEach((entity) => {
        if (!this.floorLightIndices.has(entity)) {
          this.floorLightIndices.set(entity, floorIndex);
        }
        const i = this.floorLightIndices.get(entity);
        floorIndex++;

        if (entity.object3D) {
          const light = entity.object3D;

          if (light.isPointLight) {
            // Move lights around on the floor to simulate disco ball reflections
            const angle = time * 0.5 + i * (Math.PI * 2 / 8);
            const radius = 1.2 + Math.sin(time * 2 + i) * 0.6;
            light.position.x = Math.cos(angle) * radius;
            light.position.z = Math.sin(angle) * radius + 0.3;
            light.position.y = 0.1;

            // Pulsing intensity
            light.intensity = 2 + Math.sin(time * 4 + i * 1.2) * 1;

            // Color cycling
            const hue = (time * 0.1 + i * 0.125) % 1;
            light.color.setHSL(hue, 1, 0.5);
          }
        }
      });
    }
  }
}
