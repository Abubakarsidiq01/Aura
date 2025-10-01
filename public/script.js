// AURA Advanced Vision Assistant - Frontend Script
// Network Animation + Voice Interaction + Image Analysis

class AuraApp {
    constructor() {
        this.currentImageId = null;
        this.isListening = false;
        this.recognition = null;
        this.sessionId = this.generateSessionId();
        
        this.initializeApp();
        this.setupNetworkAnimation();
        this.setupVoiceRecognition();
        this.setupEventListeners();
    }

    generateSessionId() {
        return 'session_' + Math.random().toString(36).substr(2, 9);
    }

    initializeApp() {
        console.log('🚀 AURA Advanced Vision Assistant initialized');
        this.showStatus('Ready for image upload and voice commands', 'info');
    }

    setupEventListeners() {
        // File upload
        const uploadArea = document.getElementById('uploadArea');
        const imageInput = document.getElementById('imageInput');

        uploadArea.addEventListener('click', () => imageInput.click());
        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        imageInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Enter key for analysis
        document.getElementById('queryInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.analyzeImage();
            }
        });
    }

    setupNetworkAnimation() {
        const canvas = document.getElementById('networkCanvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        const particleCount = 150;
        let mouse = { x: null, y: null };

        // Create particles
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                radius: Math.random() * 2 + 1
            });
        }

        // Mouse tracking
        canvas.addEventListener('mousemove', (e) => {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });

        canvas.addEventListener('mouseleave', () => {
            mouse.x = null;
            mouse.y = null;
        });

        // Animation loop
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Update and draw particles
            particles.forEach((particle, i) => {
                // Move particles
                particle.x += particle.vx;
                particle.y += particle.vy;

                // Bounce off edges
                if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
                if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

                // Mouse attraction
                if (mouse.x && mouse.y) {
                    const dx = mouse.x - particle.x;
                    const dy = mouse.y - particle.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 100) {
                        particle.x += dx * 0.01;
                        particle.y += dy * 0.01;
                    }
                }

                // Draw particle
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fill();

                // Draw connections
                particles.slice(i + 1).forEach(otherParticle => {
                    const dx = particle.x - otherParticle.x;
                    const dy = particle.y - otherParticle.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 100) {
                        ctx.beginPath();
                        ctx.moveTo(particle.x, particle.y);
                        ctx.lineTo(otherParticle.x, otherParticle.y);
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.2 * (1 - distance / 100)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                });

                // Mouse connections
                if (mouse.x && mouse.y) {
                    const dx = mouse.x - particle.x;
                    const dy = mouse.y - particle.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 150) {
                        ctx.beginPath();
                        ctx.moveTo(particle.x, particle.y);
                        ctx.lineTo(mouse.x, mouse.y);
                        ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 * (1 - distance / 150)})`;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            });

            requestAnimationFrame(animate);
        };

        animate();

        // Resize handler
        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        });
    }

    setupVoiceRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn('Speech recognition not supported');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            console.log('🎤 Voice recognition started');
            this.updateWakeWordIndicator('Listening...', true);
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
            console.log('🗣️ Heard:', transcript);

            if (transcript.includes('hey aura') || transcript.includes('aura')) {
                this.handleWakeWord(transcript);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.updateWakeWordIndicator('🎤 Say "Hey AURA" to start', false);
        };

        this.recognition.onend = () => {
            if (!this.isListening) {
                this.updateWakeWordIndicator('🎤 Say "Hey AURA" to start', false);
                // Restart recognition for wake word detection
                setTimeout(() => {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.log('Recognition restart failed:', e);
                    }
                }, 1000);
            }
        };

        // Start initial recognition
        try {
            this.recognition.start();
        } catch (e) {
            console.log('Initial recognition start failed:', e);
        }
    }

    handleWakeWord(transcript) {
        console.log('👋 Wake word detected!');
        this.updateWakeWordIndicator('Wake word detected! Processing...', true);
        
        // Extract query after wake word
        let query = transcript.replace(/hey aura|aura/gi, '').trim();
        
        if (query) {
            document.getElementById('queryInput').value = query;
            this.analyzeImage();
        } else {
            this.showStatus('I heard you! Please ask a question about your image.', 'info');
            this.updateWakeWordIndicator('🎤 Say "Hey AURA" to start', false);
        }
    }

    updateWakeWordIndicator(text, listening) {
        const indicator = document.getElementById('wakeWordIndicator');
        indicator.textContent = text;
        
        if (listening) {
            indicator.classList.add('listening');
        } else {
            indicator.classList.remove('listening');
        }
    }

    // File handling methods
    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            document.getElementById('imageInput').files = files;
            this.updateUploadArea(files[0]);
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.updateUploadArea(file);
        }
    }

    updateUploadArea(file) {
        const uploadArea = document.getElementById('uploadArea');
        if (file) {
            uploadArea.innerHTML = `<div class="upload-text">📸 Selected: ${file.name}</div>`;
        } else {
            uploadArea.innerHTML = `<div class="upload-text">📸 Click to select an image or drag & drop</div>`;
        }
    }

    async uploadImage() {
        const fileInput = document.getElementById('imageInput');
        const file = fileInput.files[0];
        
        if (!file) {
            this.showStatus('Please select an image first', 'error');
            return;
        }

        const uploadBtn = document.getElementById('uploadBtn');
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="loading"></span>Uploading...';

        try {
            const formData = new FormData();
            formData.append('image', file);

            const response = await fetch('/api/upload-image', {
                method: 'POST',
                headers: {
                    'X-Session-ID': this.sessionId
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.currentImageId = data.image_id;
            
            this.showStatus('✅ Image uploaded successfully! Ready to analyze.', 'success');
            document.getElementById('queryInput').focus();

        } catch (error) {
            this.showStatus(`❌ Upload failed: ${error.message}`, 'error');
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.innerHTML = 'Upload Image';
        }
    }

    async analyzeImage() {
        if (!this.currentImageId) {
            this.showStatus('Please upload an image first', 'error');
            return;
        }

        const query = document.getElementById('queryInput').value.trim();
        if (!query) {
            this.showStatus('Please enter a question about the image', 'error');
            return;
        }

        const voiceResponse = document.getElementById('voiceToggle').checked;
        const selectedModel = document.getElementById('modelSelect').value;

        const analyzeBtn = document.getElementById('analyzeBtn');
        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<span class="loading"></span>Analyzing...';

        try {
            const response = await fetch('/api/analyze-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': this.sessionId
                },
                body: JSON.stringify({
                    image_id: this.currentImageId,
                    query: query,
                    voice_response: voiceResponse,
                    model: selectedModel,
                    session_id: this.sessionId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            let resultHtml = `<strong>Analysis:</strong> ${data.description}`;
            
            if (data.audio_url && voiceResponse) {
                resultHtml += `<br><br><audio controls class="audio-player"><source src="${data.audio_url}" type="audio/mpeg">Your browser does not support audio.</audio>`;
            }

            if (data.use_case_detected) {
                resultHtml += `<br><small>Detected use case: ${data.use_case_detected}</small>`;
            }

            this.showStatus(resultHtml, 'success');
            
            // Clear query for next question
            document.getElementById('queryInput').value = '';

        } catch (error) {
            this.showStatus(`❌ Analysis failed: ${error.message}`, 'error');
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = 'Analyze Image';
            this.updateWakeWordIndicator('🎤 Say "Hey AURA" to start', false);
        }
    }

    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.innerHTML = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';

        // Auto-hide after 10 seconds for success messages
        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 10000);
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.auraApp = new AuraApp();
});

// Global functions for button clicks
function uploadImage() {
    window.auraApp.uploadImage();
}

function analyzeImage() {
    window.auraApp.analyzeImage();
}
