const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const startBtn = document.getElementById('start-btn');
const startScreen = document.getElementById('start-screen');
const statusText = document.getElementById('status-text');

let audioCtx = null;
let masterGainNode = null;

// Audio context initialization requires user interaction
startBtn.addEventListener('click', () => {
    startScreen.style.display = 'none';
    
    // Create AudioContext
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = 0.3; // Moderate overall volume
    masterGainNode.connect(audioCtx.destination);
    
    // Start webcam and hand tracking
    statusText.innerText = "Initializing Camera...";
    camera.start();
});

const FINGER_TIPS = {
    INDEX: 8,
    MIDDLE: 12,
    RING: 16,
    PINKY: 20
};

// Map of physical hands to notes
const NOTES = {
    'Right': {
        8: { id: 'note-do-1', freq: 261.63, name: 'Do' }, // C4
        12: { id: 'note-re', freq: 293.66, name: 'Re' },  // D4
        16: { id: 'note-mi', freq: 329.63, name: 'Mi' },  // E4
        20: { id: 'note-fa', freq: 349.23, name: 'Fa' }   // F4
    },
    'Left': {
        8: { id: 'note-so', freq: 392.00, name: 'So' },   // G4
        12: { id: 'note-la', freq: 440.00, name: 'La' },  // A4
        16: { id: 'note-ti', freq: 493.88, name: 'Ti' },  // B4
        20: { id: 'note-do-2', freq: 523.25, name: 'Do' } // C5
    }
};

const NOTE_COLORS = {
    'Right_8': '#ff0055',  // Do: Neon Pink/Red
    'Right_12': '#ff6600', // Re: Neon Orange
    'Right_16': '#ffcc00', // Mi: Neon Yellow
    'Right_20': '#33cc33', // Fa: Neon Green
    'Left_8': '#00cccc',   // So: Neon Cyan
    'Left_12': '#0066ff',  // La: Neon Blue
    'Left_16': '#9900ff',  // Ti: Neon Purple
    'Left_20': '#ff00cc'   // Do: Neon Magenta
};

function updateBackground(activeKeys) {
    const body = document.body;
    if (activeKeys.length === 0) {
        body.style.setProperty('--bg-1', '#0f172a');
        body.style.setProperty('--bg-2', '#2e1065');
        body.style.setProperty('--bg-3', '#1e1b4b');
        body.style.setProperty('--bg-4', '#172554');
    } else if (activeKeys.length === 1) {
        const c1 = NOTE_COLORS[activeKeys[0]];
        body.style.setProperty('--bg-1', c1);
        body.style.setProperty('--bg-2', '#1a0b2e'); // Deep shadow
        body.style.setProperty('--bg-3', c1);
        body.style.setProperty('--bg-4', '#0d132b');
    } else if (activeKeys.length === 2) {
        body.style.setProperty('--bg-1', NOTE_COLORS[activeKeys[0]]);
        body.style.setProperty('--bg-2', NOTE_COLORS[activeKeys[1]]);
        body.style.setProperty('--bg-3', NOTE_COLORS[activeKeys[0]]);
        body.style.setProperty('--bg-4', NOTE_COLORS[activeKeys[1]]);
    } else if (activeKeys.length === 3) {
        body.style.setProperty('--bg-1', NOTE_COLORS[activeKeys[0]]);
        body.style.setProperty('--bg-2', NOTE_COLORS[activeKeys[1]]);
        body.style.setProperty('--bg-3', NOTE_COLORS[activeKeys[2]]);
        body.style.setProperty('--bg-4', NOTE_COLORS[activeKeys[0]]);
    } else {
        body.style.setProperty('--bg-1', NOTE_COLORS[activeKeys[0]]);
        body.style.setProperty('--bg-2', NOTE_COLORS[activeKeys[1]]);
        body.style.setProperty('--bg-3', NOTE_COLORS[activeKeys[2]]);
        body.style.setProperty('--bg-4', NOTE_COLORS[activeKeys[3]]);
    }
}

const activeOscillators = {};

function playTone(freq, hand, finger) {
    if (!audioCtx) return;
    
    const key = `${hand}_${finger}`;
    if (activeOscillators[key]) return; // Already playing

    // Creating two oscillators for a richer sound (synth-like)
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc1.type = 'triangle';
    osc2.type = 'sine';
    
    osc1.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc2.frequency.setValueAtTime(freq * 2, audioCtx.currentTime); // One octave higher
    osc2.detune.value = 5; // Slight detuning for chorus effect
    
    // ADSR Envelope
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.05); // Attack
    gainNode.gain.exponentialRampToValueAtTime(0.5, audioCtx.currentTime + 0.2); // Decay to Sustain
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(masterGainNode);
    
    osc1.start();
    osc2.start();
    
    activeOscillators[key] = { osc1, osc2, gainNode };
}

function stopTone(hand, finger) {
    const key = `${hand}_${finger}`;
    if (activeOscillators[key]) {
        const { osc1, osc2, gainNode } = activeOscillators[key];
        const now = audioCtx.currentTime;
        
        // Release phase
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc1.stop(now + 0.15);
        osc2.stop(now + 0.15);
        
        delete activeOscillators[key];
    }
}

// 2D Distance formulation with Aspect Ratio Correction
// (Normalized coordinates warp circles into ellipses; we must multiply X by aspect ratio)
function getDistance(p1, p2) {
    const aspectRatio = canvasElement.width / canvasElement.height;
    return Math.sqrt(
        Math.pow((p1.x - p2.x) * aspectRatio, 2) + 
        Math.pow(p1.y - p2.y, 2)
    );
}

// Highly accurate dynamic pinch threshold based on visual hand size
// Adjusted to 0.30 and using aspect ratio correction. This makes the distance 
// measurement perfectly circular and large enough to reliably catch any pinch.
const PINCH_THRESHOLD_MULTIPLIER = 0.30;

const pinchStates = {
    'Right': { 8: false, 12: false, 16: false, 20: false },
    'Left': { 8: false, 12: false, 16: false, 20: false }
};

function resetVisuals() {
    document.querySelectorAll('.note-card').forEach(card => card.classList.remove('active'));
}

function onResults(results) {
    // Dynamically resize canvas to match the physical camera stream (crucial for mobile portrait modes)
    if (results.image) {
        // Only trigger an expensive resize if the dimensions don't match
        if (canvasElement.width !== results.image.width || canvasElement.height !== results.image.height) {
            canvasElement.width = results.image.width;
            canvasElement.height = results.image.height;
        }
    }

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Removed video drawing to keep the background clean and beautiful
    // We strictly only draw the glowing hand detection now.

    resetVisuals();
    
    const activeNotesThisFrame = [];
    let detectedNotes = [];

    if (results.multiHandLandmarks && results.multiHandedness && results.multiHandedness.length > 0) {
        for (let index = 0; index < results.multiHandLandmarks.length; index++) {
            const landmarks = results.multiHandLandmarks[index];
            const rawHandedness = results.multiHandedness[index].label; 
            
            // Mirroring the camera horizontally flips the visual "Left" and "Right"
            const handLabel = rawHandedness === 'Left' ? 'Right' : 'Left'; 

            // Draw Hand Skeleton
            canvasCtx.save();
            canvasCtx.scale(-1, 1);
            canvasCtx.translate(-canvasElement.width, 0);
            
            // Thicker, more gorgeous neon lines for the hand skeleton
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {
                color: 'rgba(255, 255, 255, 0.4)', 
                lineWidth: 4
            });
            drawLandmarks(canvasCtx, landmarks, {
                color: handLabel === 'Right' ? '#ff5c8a' : '#5c8aff', 
                lineWidth: 2, 
                radius: 5,
                fillColor: '#ffffff'
            });
            
            canvasCtx.restore();

            const thumbTip = landmarks[4];
            
            // Measure hand size across palm to establish dynamic threshold depth
            const handSize = getDistance(landmarks[0], landmarks[5]);
            const dynamicThreshold = handSize * PINCH_THRESHOLD_MULTIPLIER;
            
            for (const finger of Object.values(FINGER_TIPS)) {
                const fingerTip = landmarks[finger];
                const distance = getDistance(thumbTip, fingerTip);
                
                if (distance < dynamicThreshold) {
                    activeNotesThisFrame.push(`${handLabel}_${finger}`);
                    const noteInfo = NOTES[handLabel][finger];
                    
                    if (!pinchStates[handLabel][finger]) {
                        pinchStates[handLabel][finger] = true;
                        if (noteInfo) {
                            playTone(noteInfo.freq, handLabel, finger);
                        }
                    }
                    
                    if (noteInfo) {
                        const el = document.getElementById(noteInfo.id);
                        if (el) el.classList.add('active');
                        detectedNotes.push(`${noteInfo.name} (${handLabel})`);
                    }
                    
                    // Display visual pinch connection vector
                    canvasCtx.save();
                    canvasCtx.scale(-1, 1);
                    canvasCtx.translate(-canvasElement.width, 0);
                    canvasCtx.beginPath();
                    canvasCtx.moveTo(thumbTip.x * canvasElement.width, thumbTip.y * canvasElement.height);
                    canvasCtx.lineTo(fingerTip.x * canvasElement.width, fingerTip.y * canvasElement.height);
                    canvasCtx.strokeStyle = '#ffff00';
                    canvasCtx.lineWidth = 5;
                    canvasCtx.stroke();
                    canvasCtx.restore();
                } else {
                    if (pinchStates[handLabel][finger]) {
                        pinchStates[handLabel][finger] = false;
                        stopTone(handLabel, finger);
                    }
                }
            }
        }
    }
    
    // Status text logic
    if (detectedNotes.length > 0) {
        statusText.innerText = "Playing: " + detectedNotes.join(", ");
        statusText.style.color = "#00ffcc";
    } else if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        statusText.innerText = "Ready - Pinch fingers to play notes";
        statusText.style.color = "#ffffff";
    } else {
        statusText.innerText = "Show your hands to the camera";
        statusText.style.color = "#ffb3c6";
    }

    // Stop notes for fingers that are no longer pinched or whose hand left screen
    for (const hand of ['Right', 'Left']) {
        for (const finger of Object.values(FINGER_TIPS)) {
            const key = `${hand}_${finger}`;
            if (activeOscillators[key] && !activeNotesThisFrame.includes(key)) {
                stopTone(hand, finger);
                pinchStates[hand][finger] = false;
            }
        }
    }
    
    // Update the beautiful background gradient based on all active notes playing
    updateBackground(activeNotesThisFrame);
}

// Setup MediaPipe Hands
const hands = new Hands({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1, // High accuracy on standard machines
  minDetectionConfidence: 0.5,  // Default confidence (0.5) is actually the most reliable for not dropping hands
  minTrackingConfidence: 0.5   // Default tracking
});
hands.onResults(onResults);

// Setup Camera (without forcing rigid width/height so mobile devices can negotiate their best aspect ratio)
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({image: videoElement});
  },
  facingMode: 'user' // Ensures front-facing camera on mobile devices
});
