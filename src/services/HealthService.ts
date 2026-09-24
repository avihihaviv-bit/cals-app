import type { ActivityData, HealthAuthStatus } from '@/types';

/**
 * Abstraction over reading activity/health data (Apple Health / HealthKit on
 * iOS, Health Connect on Android). Every call site in this app depends only
 * on this interface, never on a platform SDK directly — so a native iOS
 * build can later swap in a real HealthKit-backed implementation (reading
 * steps, active energy, exercise minutes, walking+running distance) behind
 * the exact same methods, with zero changes to UI code.
 *
 * IMPORTANT: this is a web app running in a browser. There is no browser
 * API that can read Apple HealthKit data — HealthKit is only reachable from
 * native Swift/iOS code (or a native wrapper such as Capacitor/React Native
 * with a HealthKit plugin). This implementation deliberately does NOT
 * fabricate step counts or activity numbers to simulate a connection; it
 * honestly reports the platform as unavailable, exactly as the product spec
 * requires ("never assume the app can always read this data").
 */
export interface HealthServiceInterface {
  isAvailable(): boolean;
  getAuthStatus(): HealthAuthStatus;
  requestAuthorization(): Promise<HealthAuthStatus>;
  getTodayActivity(): Promise<ActivityData | null>;
  getActivityHistory(days: number): Promise<ActivityData[]>;
  disconnect(): void;
}

class WebHealthService implements HealthServiceInterface {
  private status: HealthAuthStatus = 'unavailable';

  isAvailable(): boolean {
    return false;
  }

  getAuthStatus(): HealthAuthStatus {
    return this.status;
  }

  async requestAuthorization(): Promise<HealthAuthStatus> {
    // No HealthKit bridge exists in a browser — never simulate a granted
    // permission or invented activity numbers here.
    this.status = 'unavailable';
    return this.status;
  }

  async getTodayActivity(): Promise<ActivityData | null> {
    return null;
  }

  async getActivityHistory(): Promise<ActivityData[]> {
    return [];
  }

  disconnect(): void {
    this.status = 'unavailable';
  }
}

export const healthService: HealthServiceInterface = new WebHealthService();
