import { createComponent, createSystem, DistanceGrabbable } from '@iwsdk/core';

// Create a custom component to mark the microphone
export const Microphone = createComponent('Microphone', {});

// Track microphone grab state
let isMicGrabbed = false;

export class MicrophoneSystem extends createSystem({
  // Query for microphone entities
  microphone: {
    required: [Microphone, DistanceGrabbable]
  }
}) {
  init() {
    this.micEntity = null;
    this.wasGrabbed = false;

    // When microphone entity is found
    this.queries.microphone.subscribe('qualify', (entity) => {
      this.attachMicrophone(entity);
    });

    // Cleanup when entity is removed
    this.queries.microphone.subscribe('disqualify', (entity) => {
      this.detachMicrophone(entity);
    });

    // Handle already-existing entities (qualify doesn't fire retroactively)
    this.queries.microphone.entities.forEach((entity) => {
      this.attachMicrophone(entity);
    });
  }

  attachMicrophone(entity) {
    console.log('MicrophoneSystem: Microphone entity initialized');
    this.micEntity = entity;
    
    // Listen for pointer events on the object3D
    if (entity.object3D) {
      entity.object3D.addEventListener('pointerdown', this.onPointerDown);
      entity.object3D.addEventListener('pointerup', this.onPointerUp);
      console.log('MicrophoneSystem: Event listeners attached to microphone');
    }
  }

  detachMicrophone(entity) {
    if (entity === this.micEntity && entity.object3D) {
      entity.object3D.removeEventListener('pointerdown', this.onPointerDown);
      entity.object3D.removeEventListener('pointerup', this.onPointerUp);
      this.micEntity = null;
      this.wasGrabbed = false;
    }
  }

  onPointerDown = () => {
    if (!this.wasGrabbed) {
      console.log('MicrophoneSystem: Microphone GRABBED');
      isMicGrabbed = true;
      this.wasGrabbed = true;
      this.world.scene.dispatchEvent({ type: 'micGrabbed' });
    }
  }

  onPointerUp = () => {
    if (this.wasGrabbed) {
      console.log('MicrophoneSystem: Microphone RELEASED');
      isMicGrabbed = false;
      this.wasGrabbed = false;
      this.world.scene.dispatchEvent({ type: 'micReleased' });
    }
  }

  update() {
    // No per-frame updates needed - using event listeners
  }
}

export { isMicGrabbed };
