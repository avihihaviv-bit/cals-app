import type { MeasurementType } from '@/types';

export const MEASUREMENT_LABELS: Record<MeasurementType, { label: string; emoji: string }> = {
  waist: { label: 'Waist', emoji: '📏' },
  abdomen: { label: 'Abdomen', emoji: '📏' },
  chest: { label: 'Chest', emoji: '📏' },
  shoulders: { label: 'Shoulders', emoji: '📏' },
  rightArm: { label: 'Right Arm', emoji: '💪' },
  leftArm: { label: 'Left Arm', emoji: '💪' },
  rightThigh: { label: 'Right Thigh', emoji: '🦵' },
  leftThigh: { label: 'Left Thigh', emoji: '🦵' },
  hips: { label: 'Hips', emoji: '📏' },
  neck: { label: 'Neck', emoji: '📏' },
  calf: { label: 'Calf', emoji: '🦵' },
};

export const MEASUREMENT_ORDER: MeasurementType[] = [
  'chest',
  'shoulders',
  'waist',
  'abdomen',
  'hips',
  'neck',
  'rightArm',
  'leftArm',
  'rightThigh',
  'leftThigh',
  'calf',
];
