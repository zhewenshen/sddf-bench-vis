/**
 * Utility functions for formatting various data types for display
 */

/**
 * Format throughput in bits per second to human-readable format
 * @param {number} bps - Throughput in bits per second
 * @returns {string} Formatted throughput string (e.g., "10 Mbps", "1 Gbps")
 */
export const formatThroughput = (bps) => {
  if (bps == null || isNaN(bps)) return 'N/A';

  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  let value = Math.abs(bps);
  let unitIndex = 0;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex++;
  }

  // Format with appropriate decimal places
  const formatted = value >= 100 ? value.toFixed(0) : value.toFixed(2);
  return `${bps < 0 ? '-' : ''}${formatted} ${units[unitIndex]}`;
};

/**
 * Format a value as a percentage
 * @param {number} value - The value to format (0-100 or 0-1 depending on context)
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted percentage string
 */
export const formatPercentage = (value, decimals = 2) => {
  if (value == null || isNaN(value)) return 'N/A';

  return `${value.toFixed(decimals)}%`;
};

/**
 * Format a number with thousand separators
 * @param {number} value - The number to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number string with thousand separators
 */
export const formatNumber = (value, decimals = 2) => {
  if (value == null || isNaN(value)) return 'N/A';

  const options = {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  };

  return value.toLocaleString('en-US', options);
};

/**
 * Format microseconds with μs unit
 * @param {number} us - Time in microseconds
 * @returns {string} Formatted time string with μs unit
 */
export const formatMicroseconds = (us) => {
  if (us == null || isNaN(us)) return 'N/A';

  // For very large values, consider converting to ms or s
  if (us >= 1000000) {
    return `${(us / 1000000).toFixed(2)} s`;
  } else if (us >= 1000) {
    return `${(us / 1000).toFixed(2)} ms`;
  }

  return `${us.toFixed(2)} μs`;
};

/**
 * Format bytes to human-readable format (KB, MB, GB, TB)
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string (e.g., "1.5 MB", "2 GB")
 */
export const formatBytes = (bytes) => {
  if (bytes == null || isNaN(bytes)) return 'N/A';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = Math.abs(bytes);
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  // Don't show decimals for bytes
  const decimals = unitIndex === 0 ? 0 : 2;
  return `${bytes < 0 ? '-' : ''}${value.toFixed(decimals)} ${units[unitIndex]}`;
};

/**
 * Format large cycle numbers to human-readable format
 * @param {number} cycles - Number of cycles
 * @returns {string} Formatted cycles string (e.g., "249.03 B" for billion, "1.5 M" for million)
 */
export const formatCycles = (cycles) => {
  if (cycles == null || isNaN(cycles)) return 'N/A';

  const units = [
    { threshold: 1e12, suffix: 'T' }, // Trillion
    { threshold: 1e9, suffix: 'B' },  // Billion
    { threshold: 1e6, suffix: 'M' },  // Million
    { threshold: 1e3, suffix: 'K' },  // Thousand
  ];

  const value = Math.abs(cycles);

  for (const unit of units) {
    if (value >= unit.threshold) {
      const formatted = (value / unit.threshold).toFixed(2);
      return `${cycles < 0 ? '-' : ''}${formatted} ${unit.suffix}`;
    }
  }

  // For values less than 1000, show without suffix
  return `${cycles.toFixed(0)}`;
};
