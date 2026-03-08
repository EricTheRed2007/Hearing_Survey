class HearingThresholdStudy {
  constructor() {
    // Test configuration
    this.frequencies = [500, 1000, 4000, 8000];
    this.stepsPerFrequency = 8;
    this.totalSteps = this.frequencies.length * this.stepsPerFrequency;
    
    // Test state
    this.currentFreqIndex = 0;
    this.currentStep = 0;
    this.thresholds = {};
    this.participantData = {};
    this.calibrationReferenceGain = 0.1; // Fixed reference gain for 0 dBFS
    
    // Audio state
    this.audioContext = null;
    this.currentOscillator = null;
    this.isPlaying = false;
    
    this.initializeElements();
    this.bindEvents();
  }

  /**
   * Initialize DOM elements
   */
  initializeElements() {
    this.elements = {
      sections: {
        hero: document.getElementById('heroSection'),
        questionnaire: document.getElementById('questionnaireSection'),
        calibration: document.getElementById('calibrationSection'),
        test: document.getElementById('testSection'),
        results: document.getElementById('resultsSection')
      },
      questionnaireForm: document.getElementById('questionnaireForm'),
      progressFill: document.getElementById('progressFill'),
      progressText: document.getElementById('progressText'),
      currentFrequency: document.getElementById('currentFrequency'),
      testStatus: document.getElementById('testStatus'),
      hearBtn: document.getElementById('hearBtn'),
      noHearBtn: document.getElementById('noHearBtn'),
      playCalToneBtn: document.getElementById('playCalToneBtn'),
      volumeSetBtn: document.getElementById('volumeSetBtn'),
      thresholdsGrid: document.getElementById('thresholdsGrid'),
      submitBtn: document.getElementById('submitResultsBtn')
    };
  }

  /**
   * Bind all event listeners
   */
    bindEvents() {
    this.elements.questionnaireForm.addEventListener('submit', (e) => this.handleQuestionnaireSubmit(e));
    this.elements.playCalToneBtn.addEventListener('click', () => this.playCalibrationTone());
    this.elements.volumeSetBtn.addEventListener('click', () => this.startHearingTest());
    this.elements.hearBtn.addEventListener('click', () => this.handleTestResponse(true));
    this.elements.noHearBtn.addEventListener('click', () => this.handleTestResponse(false));
    this.elements.submitBtn.addEventListener('click', () => this.submitResults());

    document
        .getElementById("startStudyBtn")
        .addEventListener("click", () => this.startQuestionnaire());
    }

  /**
   * Switch between sections with smooth transition
   */
  switchSection(activeSectionId) {
    Object.values(this.elements.sections).forEach(section => {
      section.classList.remove('active');
    });
    this.elements.sections[activeSectionId].classList.add('active');
    this.scrollToActiveSection();
  }

  /**
   * Smoothly scroll the viewport to keep the active section centered
   */
  scrollToActiveSection() {
    const activeSection = document.querySelector('.section.active');
    if (!activeSection) return;

    const rect = activeSection.getBoundingClientRect();
    const absoluteTop = rect.top + window.scrollY;
    const offset = Math.max(absoluteTop - 40, 0); // small top margin

    window.scrollTo({
      top: offset,
      behavior: 'smooth'
    });
  }


  /**
   * Initialize questionnaire section
   */
  startQuestionnaire() {
    this.switchSection('questionnaire');
  }

  /**
   * Handle questionnaire submission
   */
  handleQuestionnaireSubmit(e) {
    e.preventDefault();
    
    const age = parseInt(document.getElementById('age').value);
    const headphoneHours = parseFloat(document.getElementById('headphoneHours').value);
    const yearsHeadphones = parseInt(document.getElementById('yearsHeadphones').value);
    const headphoneConfirm = document.getElementById('headphoneConfirm').checked;

    if (!age || !headphoneHours || !yearsHeadphones || !headphoneConfirm) {
      alert('Please complete all fields and confirm headphone usage.');
      return;
    }

    this.participantData = {
      participant_id: crypto.randomUUID(),
      age,
      headphone_hours: headphoneHours,
      years_using_headphones: yearsHeadphones,
      device_info: {
        user_agent: navigator.userAgent,
        platform: navigator.platform,
        sample_rate: null // Set after audio init
      },
      thresholds: {}
    };

    this.switchSection('calibration');
  }

  /**
   * Play calibration tone (1000 Hz at reference gain)
   */
  async playCalibrationTone() {
    await this.ensureAudioContext();
    
    this.elements.playCalToneBtn.disabled = true;
    this.elements.playCalToneBtn.textContent = 'Playing...';
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime);
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(this.calibrationReferenceGain, this.audioContext.currentTime);
      
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 2);

      // Enable continue button after playback
      oscillator.onended = () => {
        this.elements.playCalToneBtn.disabled = false;
        this.elements.playCalToneBtn.textContent = 'Play Calibration Tone (1000 Hz)';
        this.elements.volumeSetBtn.disabled = false;
      };

    } catch (error) {
      console.error('Calibration tone error:', error);
      this.elements.playCalToneBtn.disabled = false;
      this.elements.playCalToneBtn.textContent = 'Play Calibration Tone (1000 Hz)';
    }
  }

  /**
   * Start the main hearing test
   */
  startHearingTest() {
    this.participantData.device_info.sample_rate = this.audioContext.sampleRate;
    this.currentFreqIndex = 0;
    this.currentStep = 0;
    this.thresholds = {};
    
    this.switchSection('test');
    this.updateTestProgress();
    this.playTestTone();
  }

  /**
   * Play test tone using binary search
   */
  async playTestTone() {
    if (this.isPlaying) return;

    await this.ensureAudioContext();
    this.isPlaying = true;
    
    const freq = this.frequencies[this.currentFreqIndex];
    const bounds = this.thresholds[freq] || { low: -90, high: -20 };
    const currentDb = (bounds.low + bounds.high) / 2;

    // Update UI
    this.elements.currentFrequency.textContent = `${freq} Hz`;
    this.elements.testStatus.innerHTML = '<p>Playing tone... Please wait.</p>';
    this.disableTestButtons();

    // Convert dBFS to linear gain relative to calibration reference
    const linearGain = this.calibrationReferenceGain * Math.pow(10, currentDb / 20);

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.setValueAtTime(freq, this.audioContext.currentTime);
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(linearGain, this.audioContext.currentTime);

      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 1.2);

      oscillator.onended = () => {
        this.isPlaying = false;
        this.elements.testStatus.innerHTML = '<p>Listen carefully to the tone. Click the appropriate button when ready.</p>';
        this.enableTestButtons();
      };

    } catch (error) {
      console.error('Test tone error:', error);
      this.handleTestResponse(false); // Fallback
    }
  }

  /**
   * Handle test response and update binary search bounds
   */
  handleTestResponse(heard) {
    const freq = this.frequencies[this.currentFreqIndex];
    
    if (!this.thresholds[freq]) {
      this.thresholds[freq] = { low: -90, high: -20 };
    }

    const bounds = this.thresholds[freq];
    
    if (heard) {
      bounds.high = (bounds.low + bounds.high) / 2;
      this.elements.testStatus.innerHTML = '<p class="success">Good! Testing quieter tones.</p>';
    } else {
      bounds.low = (bounds.low + bounds.high) / 2;
      this.elements.testStatus.innerHTML = '<p class="error">Understood. Testing louder tones.</p>';
    }

    this.currentStep++;

    this.updateTestProgress();

    // Next step logic
    if (this.currentStep >= this.stepsPerFrequency) {
      // Complete this frequency, record threshold
      this.participantData.thresholds[freq] = Math.round((bounds.low + bounds.high) / 2);
      this.nextFrequency();
    } else {
      // Next step same frequency
      setTimeout(() => this.playTestTone(), 1000);
    }
  }

  /**
   * Move to next frequency
   */
  nextFrequency() {
    this.currentFreqIndex++;
    
    if (this.currentFreqIndex >= this.frequencies.length) {
      this.showResults();
    } else {
      this.currentStep = 0;
      setTimeout(() => {
        this.updateTestProgress();
        this.playTestTone();
      }, 1500);
    }
  }

  /**
   * Update test progress UI
   */
  updateTestProgress() {
    const currentStepTotal = (this.currentFreqIndex * this.stepsPerFrequency) + this.currentStep + 1;
    const progress = (currentStepTotal / this.totalSteps) * 100;
    
    this.elements.progressFill.style.width = `${progress}%`;
    this.elements.progressText.textContent = `Step ${currentStepTotal} of ${this.totalSteps}`;
  }

  /**
   * Show results
   */
  showResults() {
    this.switchSection('results');
    
    const grid = this.elements.thresholdsGrid;
    grid.innerHTML = '';

    this.frequencies.forEach(freq => {
      const threshold = this.participantData.thresholds[freq];
      const card = document.createElement('div');
      card.className = 'threshold-card';
      card.innerHTML = `
        <div class="threshold-frequency">${freq} Hz</div>
        <div class="threshold-value">${threshold}</div>
        <div class="threshold-unit">dBFS</div>
      `;
      grid.appendChild(card);
    });
  }

  /**
   * Submit results to backend
   */
  async submitResults() {
    try {
      this.elements.submitBtn.disabled = true;
      this.elements.submitBtn.textContent = 'Submitting...';

      const API_URL = window.API_URL;
      const response = await fetch(`${API_URL}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.participantData)
      });

      if (response.ok) {
        alert('Thank you! Your results have been submitted to the research database.');
      } else {
        throw new Error('Server response not OK');
      }
    } catch (error) {
      console.error('Submission error:', error);
      alert('Results saved locally. Submission unavailable.');
    } finally {
      this.elements.submitBtn.disabled = false;
      this.elements.submitBtn.textContent = 'Submit Results to Research';
    }
  }

  /**
   * Ensure AudioContext is running
   */
  async ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Enable/disable test buttons
   */
  enableTestButtons() {
    this.elements.hearBtn.disabled = false;
    this.elements.noHearBtn.disabled = false;
  }

  disableTestButtons() {
    this.elements.hearBtn.disabled = true;
    this.elements.noHearBtn.disabled = true;
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
  new HearingThresholdStudy();
});

document.addEventListener("DOMContentLoaded", () => {
  const app = new HearingThresholdStudy();
  app.switchSection("hero");
});