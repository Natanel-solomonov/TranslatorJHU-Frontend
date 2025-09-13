// Mock authentication service
export interface User {
  id: string;
  username: string;
  voiceEnrolled: boolean;
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
  private users: Map<string, User> = new Map();
  private currentUser: User | null = null;
  private enrollmentPhrases: string[] = [
    "The quick brown fox jumps over the lazy dog",
    "Hello, my name is and I love using this translation app",
    "Today is a beautiful day for learning new languages",
    "Technology makes the world more connected than ever",
    "I enjoy speaking different languages with people from around the world"
  ];

  constructor() {
    // Initialize with some mock users
    this.initializeMockUsers();
  }

  private initializeMockUsers() {
    const mockUsers: User[] = [
      {
        id: '1',
        username: 'demo',
        voiceEnrolled: true,
        createdAt: new Date('2024-01-01'),
        lastLogin: new Date()
      }
    ];

    mockUsers.forEach(user => {
      this.users.set(user.username, user);
    });
  }

  async login(username: string): Promise<{ success: boolean; user?: User; message: string }> {
    try {
      const user = this.users.get(username.toLowerCase());
      
      if (!user) {
        return {
          success: false,
          message: 'User not found. Please sign up first.'
        };
      }

      // Update last login
      user.lastLogin = new Date();
      this.currentUser = user;

      return {
        success: true,
        user,
        message: 'Login successful!'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Login failed. Please try again.'
      };
    }
  }

  async signup(username: string): Promise<{ success: boolean; user?: User; message: string }> {
    try {
      const normalizedUsername = username.toLowerCase().trim();
      
      if (this.users.has(normalizedUsername)) {
        return {
          success: false,
          message: 'Username already exists. Please choose a different one.'
        };
      }

      if (normalizedUsername.length < 3) {
        return {
          success: false,
          message: 'Username must be at least 3 characters long.'
        };
      }

      const newUser: User = {
        id: Date.now().toString(),
        username: normalizedUsername,
        voiceEnrolled: false,
        createdAt: new Date(),
        lastLogin: new Date()
      };

      this.users.set(normalizedUsername, newUser);
      this.currentUser = newUser;

      return {
        success: true,
        user: newUser,
        message: 'Account created successfully!'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Signup failed. Please try again.'
      };
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  logout(): void {
    this.currentUser = null;
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

      // Mark user as voice enrolled
      this.currentUser.voiceEnrolled = true;
      this.users.set(this.currentUser.username, this.currentUser);

      return {
        success: true,
        message: 'Voice enrollment completed successfully!'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Voice enrollment failed. Please try again.'
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
