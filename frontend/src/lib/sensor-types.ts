/**
 * Sensor type definitions — defines metrics, charts, and display config per sensor type.
 * Single source of truth for how each sensor type is visualized.
 */

export interface SensorMetric {
  key: string;
  name: string;
  unit: string;
  color: string;
}

export interface ChartConfig {
  title: string;
  chartType: 'line' | 'area' | 'bar';
  dataKeys: { key: string; name: string; color: string }[];
  thresholds?: { value: number; color: string; label: string }[];
}

export interface SensorTypeConfig {
  id: string;
  name: string;
  description: string;
  metrics: SensorMetric[];
  chartConfigs: ChartConfig[];
}

export const SENSOR_TYPES: Record<string, SensorTypeConfig> = {
  vibesense: {
    id: 'vibesense',
    name: 'VibeSense',
    description: '3D vibration monitoring for rotating equipment',
    metrics: [
      { key: 'vib_rms_x', name: 'Vibration X', unit: 'g', color: '#3b82f6' },
      { key: 'vib_rms_y', name: 'Vibration Y', unit: 'g', color: '#10b981' },
      { key: 'vib_rms_z', name: 'Vibration Z', unit: 'g', color: '#f59e0b' },
      { key: 'anomaly_score', name: 'Anomaly', unit: '%', color: '#8b5cf6' },
      { key: 'temperature_1', name: 'Temperature', unit: 'C', color: '#ef4444' },
      { key: 'current_rms', name: 'Current', unit: 'A', color: '#06b6d4' },
    ],
    chartConfigs: [
      {
        title: 'Vibration Trend',
        chartType: 'line',
        dataKeys: [
          { key: 'vib_rms_x', name: 'RMS X', color: '#3b82f6' },
          { key: 'vib_rms_y', name: 'RMS Y', color: '#10b981' },
          { key: 'vib_rms_z', name: 'RMS Z', color: '#f59e0b' },
        ],
      },
      {
        title: 'Anomaly Score',
        chartType: 'area',
        dataKeys: [{ key: 'anomaly_score', name: 'Anomaly', color: '#8b5cf6' }],
        thresholds: [{ value: 0.5, color: '#ef4444', label: 'Threshold' }],
      },
    ],
  },

  energysense: {
    id: 'energysense',
    name: 'EnergySense',
    description: 'Energy monitoring with grid/solar tracking',
    metrics: [
      { key: 'grid_power_w', name: 'Grid Power', unit: 'W', color: '#ef4444' },
      { key: 'solar_power_w', name: 'Solar Power', unit: 'W', color: '#22c55e' },
      { key: 'channel_1_w', name: 'Channel 1', unit: 'W', color: '#3b82f6' },
      { key: 'channel_2_w', name: 'Channel 2', unit: 'W', color: '#f59e0b' },
      { key: 'channel_3_w', name: 'Channel 3', unit: 'W', color: '#10b981' },
      { key: 'channel_4_w', name: 'Channel 4', unit: 'W', color: '#8b5cf6' },
      { key: 'power_factor', name: 'Power Factor', unit: '', color: '#06b6d4' },
    ],
    chartConfigs: [
      {
        title: 'Grid vs Solar',
        chartType: 'area',
        dataKeys: [
          { key: 'grid_power_w', name: 'Grid', color: '#ef4444' },
          { key: 'solar_power_w', name: 'Solar', color: '#22c55e' },
        ],
      },
      {
        title: 'Channels',
        chartType: 'bar',
        dataKeys: [
          { key: 'channel_1_w', name: 'Ch 1', color: '#3b82f6' },
          { key: 'channel_2_w', name: 'Ch 2', color: '#f59e0b' },
          { key: 'channel_3_w', name: 'Ch 3', color: '#10b981' },
          { key: 'channel_4_w', name: 'Ch 4', color: '#8b5cf6' },
        ],
      },
    ],
  },

  climatesense: {
    id: 'climatesense',
    name: 'ClimateSense',
    description: 'Environmental monitoring: temperature, humidity, air pressure',
    metrics: [
      { key: 'temperature_1', name: 'Temperature', unit: 'C', color: '#ef4444' },
      { key: 'humidity', name: 'Humidity', unit: '%', color: '#3b82f6' },
      { key: 'air_pressure', name: 'Air Pressure', unit: 'hPa', color: '#10b981' },
    ],
    chartConfigs: [
      {
        title: 'Temperature & Humidity',
        chartType: 'line',
        dataKeys: [
          { key: 'temperature_1', name: 'Temperature', color: '#ef4444' },
          { key: 'humidity', name: 'Humidity', color: '#3b82f6' },
        ],
      },
      {
        title: 'Air Pressure',
        chartType: 'area',
        dataKeys: [{ key: 'air_pressure', name: 'Pressure', color: '#10b981' }],
      },
    ],
  },

  acoustisense: {
    id: 'acoustisense',
    name: 'AcoustiSense',
    description: 'Ultrasound and acoustic emission for leak detection',
    metrics: [
      { key: 'sound_db', name: 'Sound Level', unit: 'dB', color: '#8b5cf6' },
      { key: 'ultrasound_db', name: 'Ultrasound', unit: 'dB', color: '#f59e0b' },
      { key: 'acoustic_emission', name: 'Acoustic Emission', unit: 'mV', color: '#ef4444' },
    ],
    chartConfigs: [
      {
        title: 'Sound & Ultrasound',
        chartType: 'line',
        dataKeys: [
          { key: 'sound_db', name: 'Sound', color: '#8b5cf6' },
          { key: 'ultrasound_db', name: 'Ultrasound', color: '#f59e0b' },
        ],
      },
      {
        title: 'Acoustic Emission',
        chartType: 'area',
        dataKeys: [{ key: 'acoustic_emission', name: 'AE', color: '#ef4444' }],
      },
    ],
  },

  multisense: {
    id: 'multisense',
    name: 'MultiSense',
    description: '6-in-1 flagship: vibration, temp, humidity, acoustic, magnetic flux',
    metrics: [
      { key: 'vib_rms_x', name: 'Vibration X', unit: 'g', color: '#3b82f6' },
      { key: 'vib_rms_y', name: 'Vibration Y', unit: 'g', color: '#10b981' },
      { key: 'vib_rms_z', name: 'Vibration Z', unit: 'g', color: '#f59e0b' },
      { key: 'temperature_1', name: 'Temperature', unit: 'C', color: '#ef4444' },
      { key: 'humidity', name: 'Humidity', unit: '%', color: '#06b6d4' },
      { key: 'acoustic_emission', name: 'Acoustic', unit: 'mV', color: '#8b5cf6' },
      { key: 'magnetic_flux', name: 'Magnetic Flux', unit: 'mT', color: '#f97316' },
      { key: 'anomaly_score', name: 'Anomaly', unit: '%', color: '#a78bfa' },
    ],
    chartConfigs: [
      {
        title: 'Vibration',
        chartType: 'line',
        dataKeys: [
          { key: 'vib_rms_x', name: 'X', color: '#3b82f6' },
          { key: 'vib_rms_y', name: 'Y', color: '#10b981' },
          { key: 'vib_rms_z', name: 'Z', color: '#f59e0b' },
        ],
      },
      {
        title: 'Environment',
        chartType: 'line',
        dataKeys: [
          { key: 'temperature_1', name: 'Temp', color: '#ef4444' },
          { key: 'humidity', name: 'Humidity', color: '#06b6d4' },
        ],
      },
    ],
  },
};

export function getSensorTypeConfig(nodeType: string): SensorTypeConfig | null {
  return SENSOR_TYPES[nodeType] || null;
}
