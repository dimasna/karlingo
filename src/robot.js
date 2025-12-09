

import {
  AudioUtils,
  createComponent,
  createSystem,
  Pressed,
  Vector3
} from '@iwsdk/core';

import { startListening, stopListening, getIsListening, isSpeechSupported } from './speech-service.js';
import { sendMessageToLLM, resetConversation, getGreeting } from './llm-service.js';
import { speak, stop as stopTTS, initVoices } from './tts-service.js';

export const Robot = createComponent('Robot', {});
export const ChatBubble = createComponent('ChatBubble', {});
export const MicButton = createComponent('MicButton', {});

// Mic button state
let micButtonMesh = null;
let micButtonCanvas = null;
let micButtonContext = null;
let micButtonTexture = null;
let isMicActive = false;

// Callback for updating chat bubble
let updateBubbleCallback = null;

export function setUpdateBubbleCallback(callback) {
  updateBubbleCallback = callback;
}

// Update mic button appearance
function updateMicButtonState(state) {
  if (!micButtonContext || !micButtonCanvas || !micButtonTexture) return;

  const ctx = micButtonContext;
  const canvas = micButtonCanvas;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = canvas.width / 2 - 10;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw circle background
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  
  if (state === 'listening') {
    ctx.fillStyle = '#ff4444';
  } else if (state === 'loading') {
    ctx.fillStyle = '#ffaa00';
  } else if (state === 'thinking') {
    ctx.fillStyle = '#00aaff';
  } else {
    ctx.fillStyle = '#00ffff';
  }
  ctx.fill();

  // Draw border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw icon/text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (state === 'listening') {
    ctx.fillText('🎤', centerX, centerY);
  } else if (state === 'loading') {
    ctx.fillText('⏳', centerX, centerY);
  } else if (state === 'thinking') {
    ctx.fillText('🤔', centerX, centerY);
  } else {
    ctx.fillText('🎤', centerX, centerY);
  }

  micButtonTexture.needsUpdate = true;
}

// Initialize mic button visuals
export function initMicButton(mesh, canvas, ctx, texture) {
  micButtonMesh = mesh;
  micButtonCanvas = canvas;
  micButtonContext = ctx;
  micButtonTexture = texture;
  initVoices();
  updateMicButtonState('idle');
}

// Handle mic button click
export async function handleMicButtonClick(world) {
  if (!isSpeechSupported()) {
    if (updateBubbleCallback) {
      updateBubbleCallback('Speech not supported 😢');
    }
    return;
  }

  if (getIsListening()) {
    stopListening();
    return;
  }

  // Show loading state
  isMicActive = true;
  updateMicButtonState('loading');
  if (updateBubbleCallback) {
    updateBubbleCallback('Starting...');
  }

  startListening(
    // On result
    async (transcript) => {
      console.log('Got transcript:', transcript);
      isMicActive = false;
      updateMicButtonState('thinking');
      
      if (updateBubbleCallback) {
        updateBubbleCallback('🤔 Thinking...');
      }

      try {
        const response = await sendMessageToLLM(transcript);
        console.log('LLM response:', response);
        
        if (updateBubbleCallback) {
          updateBubbleCallback(response);
        }
        
        // Speak the response
        speak(response, () => {
          updateMicButtonState('idle');
        });
        
        updateMicButtonState('idle');
      } catch (error) {
        console.error('LLM error:', error);
        if (updateBubbleCallback) {
          updateBubbleCallback('Oops! Try again 🔧');
        }
        updateMicButtonState('idle');
      }
    },
    // On status
    (status) => {
      if (status.type === 'start') {
        updateMicButtonState('listening');
        if (updateBubbleCallback) {
          updateBubbleCallback('🎤 Listening...');
        }
      } else if (status.type === 'interim') {
        if (updateBubbleCallback) {
          updateBubbleCallback(status.message);
        }
      } else if (status.type === 'error') {
        isMicActive = false;
        updateMicButtonState('idle');
        if (updateBubbleCallback) {
          updateBubbleCallback(status.message || 'Error 😢');
        }
      } else if (status.type === 'end') {
        if (!isMicActive) {
          updateMicButtonState('idle');
        }
      }
    }
  );
}

export class RobotSystem extends createSystem({
  robot: { required: [Robot] },
  robotClicked: { required: [Robot, Pressed] },
  chatBubble: { required: [ChatBubble] },
  micButton: { required: [MicButton] },
  micButtonClicked: { required: [MicButton, Pressed] }
}) {
  init() {
    this.lookAtTarget = new Vector3();
    this.vec3 = new Vector3();

    // Handle mic button clicks
    this.queries.micButtonClicked.subscribe('qualify', (entity) => {
      handleMicButtonClick(this.world);
    });

    // Listen for language changes to reset conversation
    this.world.scene.addEventListener('languageChanged', () => {
      resetConversation();
      const greeting = getGreeting();
      if (updateBubbleCallback) {
        updateBubbleCallback(greeting);
      }
      console.log('Language changed - conversation reset');
    });
  }

  update() {
    // Make robots look at player
    this.queries.robot.entities.forEach((entity) => {
      this.player.head.getWorldPosition(this.lookAtTarget);
      const spinnerObject = entity.object3D;
      spinnerObject.getWorldPosition(this.vec3);
      this.lookAtTarget.y = this.vec3.y;
      spinnerObject.lookAt(this.lookAtTarget);
    });

    // Make chat bubbles face player (billboard effect)
    this.queries.chatBubble.entities.forEach((entity) => {
      this.player.head.getWorldPosition(this.lookAtTarget);
      const bubbleObject = entity.object3D;
      bubbleObject.getWorldPosition(this.vec3);
      this.lookAtTarget.y = this.vec3.y;
      bubbleObject.lookAt(this.lookAtTarget);
    });

    // Make mic buttons face player
    this.queries.micButton.entities.forEach((entity) => {
      this.player.head.getWorldPosition(this.lookAtTarget);
      const buttonObject = entity.object3D;
      buttonObject.getWorldPosition(this.vec3);
      this.lookAtTarget.y = this.vec3.y;
      buttonObject.lookAt(this.lookAtTarget);
    });
  }
}
