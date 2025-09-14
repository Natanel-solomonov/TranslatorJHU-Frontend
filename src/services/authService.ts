// Database-integrated authentication service
export interface User {
  id: string;
  username: string;
  voiceEnrolled: boolean;
  voiceId?: string;
  voiceName?: string;
  createdAt: Date;
  lastLogin: Date;
}

export interface VoiceEnrollment {
  phraseId: string;
  phrase: string;
  audioData: ArrayBuffer;
  recorded: boolean;
}

class AuthService {
  private currentUser: User | null = null;
  private enrollmentPhrases: string[] = [
    "The quick brown fox jumps over the lazy dog",
    "Hello, my name is and I love using this translation app",
    "Today is a beautiful day for learning new languages",
    "Technology makes the world more connected than ever",
    "I enjoy speaking different languages with people from around the world"
  ];

  constructor() {
    // Load current user from localStorage if available
    this.loadCurrentUser();
  }

  private loadCurrentUser() {
    try {
      const stored = localStorage.getItem('currentUser');
      if (stored) {
        this.currentUser = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading current user:', error);
      this.currentUser = null;
    }
  }

  private saveCurrentUser() {
    try {
      if (this.currentUser) {
        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
      } else {
        localStorage.removeItem('currentUser');
      }
    } catch (error) {
      console.error('Error saving current user:', error);
    }
  }

  async login(username: string): Promise<{ success: boolean; user?: User; message: string }> {
    try {
      const response = await fetch('http://localhost:8080/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.toLowerCase().trim() })
      });

      const result = await response.json();
      
      if (result.success) {
        this.currentUser = result.user;
        this.saveCurrentUser();
        return {
          success: true,
          user: result.user,
          message: 'Login successful!'
        };
      } else {
        return {
          success: false,
          message: result.message || 'Login failed. Please try again.'
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'Login failed. Please check your connection and try again.'
      };
    }
  }

  async signup(username: string): Promise<{ success: boolean; user?: User; message: string }> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      
      if (normalizedUsername.length < 3) {
        return {
          success: false,
          message: 'Username must be at least 3 characters long.'
        };
      }

      const response = await fetch('http://localhost:8080/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: normalizedUsername })
      });

      const result = await response.json();
      
      if (result.success) {
        this.currentUser = result.user;
        this.saveCurrentUser();
        return {
          success: true,
          user: result.user,
          message: 'Account created successfully!'
        };
      } else {
        return {
          success: false,
          message: result.message || 'Signup failed. Please try again.'
        };
      }
    } catch (error) {
      console.error('Signup error:', error);
      return {
        success: false,
        message: 'Signup failed. Please check your connection and try again.'
      };
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  logout(): void {
    this.currentUser = null;
    this.saveCurrentUser();
  }

  getRandomEnrollmentPhrases(count: number = 3): string[] {
    const shuffled = [...this.enrollmentPhrases].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  async completeVoiceEnrollment(phraseRecordings: VoiceEnrollment[]): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.currentUser) {
        return {
          success: false,
          message: 'No user logged in'
        };
      }

      // Check if all phrases were recorded
      const allRecorded = phraseRecordings.every(recording => recording.recorded);
      
      if (!allRecorded) {
        return {
          success: false,
          message: 'Please record all required phrases'
        };
      }

      // Send audio data to backend for storage and voice cloning
      const response = await fetch('http://localhost:8080/api/auth/complete-voice-enrollment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: this.currentUser.id,
          username: this.currentUser.username,
          audioRecordings: phraseRecordings.map(recording => ({
            phraseId: recording.phraseId,
            phrase: recording.phrase,
            audioData: Array.from(new Uint8Array(recording.audioData)), // Convert ArrayBuffer to array
            recorded: recording.recorded
          }))
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // Update current user with new voice enrollment status
        this.currentUser.voiceEnrolled = true;
        this.saveCurrentUser();
        
        return {
          success: true,
          message: 'Voice enrollment completed successfully!'
        };
      } else {
        return {
          success: false,
          message: result.message || 'Voice enrollment failed. Please try again.'
        };
      }
    } catch (error) {
      console.error('Voice enrollment error:', error);
      return {
        success: false,
        message: 'Voice enrollment failed. Please check your connection and try again.'
      };
    }
  }

  isLoggedIn(): boolean {
    return this.currentUser !== null;
  }

  isVoiceEnrolled(): boolean {
    return this.currentUser?.voiceEnrolled || false;
  }
}

export const authService = new AuthService();
