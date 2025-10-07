/**
 * Utility functions for preparing table data from run objects.
 * This module handles the transformation of CSV and JSON data into
 * a format suitable for table display.
 */

import {
  formatThroughput,
  formatPercentage,
  formatMicroseconds,
  formatNumber,
  formatCycles,
} from './formatters.js';

/**
 * Prepares table data from a run object by combining CSV and JSON data.
 *
 * This function takes a run object (which contains CSV data and optional JSON CPU data)
 * and transforms it into an array of row objects suitable for table display. Each row
 * represents a single test point and includes throughput metrics, RTT statistics,
 * packet information, and CPU utilization data (if available).
 *
 * The function matches CSV rows with JSON test data by converting the CSV throughput
 * from bits per second to megabits per second and finding the corresponding test.
 *
 * @param {Object} run - The run object containing test data
 * @param {number} run.id - Unique identifier for the run
 * @param {string} run.name - Name of the run
 * @param {Array<Object>} run.data - Array of CSV data rows
 * @param {number} run.data[].Requested_Throughput - Requested throughput in bps
 * @param {number} run.data[].Receive_Throughput - Received throughput in bps
 * @param {number} run.data[].Average_RTT - Average round-trip time in microseconds
 * @param {number} run.data[].Minimum_RTT - Minimum round-trip time in microseconds
 * @param {number} run.data[].Maximum_RTT - Maximum round-trip time in microseconds
 * @param {number} run.data[].Stdev_RTT - Standard deviation of RTT in microseconds
 * @param {number} run.data[].Median_RTT - Median round-trip time in microseconds
 * @param {number} run.data[].Bad_Packets - Number of bad packets
 * @param {Object|null} [run.cpuData] - Optional JSON CPU data
 * @param {Array<Object>} [run.cpuData.tests] - Array of test objects with CPU data
 * @param {number} run.cpuData.tests[].throughput_mbps - Throughput in Mbps
 * @param {Object} run.cpuData.tests[].system - System-level CPU metrics
 * @param {number} run.cpuData.tests[].system.cpu_utilization - Total CPU utilization percentage
 * @param {number} run.cpuData.tests[].system.kernel_cpu_utilization - Kernel CPU utilization percentage
 * @param {number} run.cpuData.tests[].system.user_cpu_utilization - User CPU utilization percentage
 * @param {Array<Object>} run.cpuData.tests[].cores - Array of core objects
 * @param {Array<Object>} run.cpuData.tests[].cores[].protection_domains - Array of PD objects
 *
 * @returns {Array<Object>} Array of row objects for table display
 * @returns {number} return[].testNumber - Test number (1-indexed)
 * @returns {number} return[].requestedThroughput - Requested throughput in bps
 * @returns {number} return[].receivedThroughput - Received throughput in bps
 * @returns {number} return[].throughputPercent - Percentage of requested throughput achieved
 * @returns {number} return[].avgRTT - Average RTT in microseconds
 * @returns {number} return[].minRTT - Minimum RTT in microseconds
 * @returns {number} return[].maxRTT - Maximum RTT in microseconds
 * @returns {number} return[].stdevRTT - Standard deviation of RTT
 * @returns {number} return[].medianRTT - Median RTT in microseconds
 * @returns {number} return[].badPackets - Number of bad packets
 * @returns {number|null} return[].totalCPU - Total CPU utilization percentage (null if no JSON data)
 * @returns {number|null} return[].kernelCPU - Kernel CPU utilization percentage (null if no JSON data)
 * @returns {number|null} return[].userCPU - User CPU utilization percentage (null if no JSON data)
 * @returns {Array<Object>} return[].protectionDomains - Array of protection domain objects (empty if no JSON data)
 *
 * @example
 * const run = {
 *   id: 1,
 *   name: "Test Run",
 *   data: [
 *     { Requested_Throughput: 10000000, Receive_Throughput: 10000184, ... },
 *     { Requested_Throughput: 20000000, Receive_Throughput: 20000341, ... }
 *   ],
 *   cpuData: {
 *     tests: [
 *       { throughput_mbps: 10, system: { cpu_utilization: 2.63, ... }, ... },
 *       { throughput_mbps: 20, system: { cpu_utilization: 4.86, ... }, ... }
 *     ]
 *   }
 * };
 *
 * const tableData = prepareTableData(run);
 * // Returns array of row objects with combined CSV and JSON data
 */
export function prepareTableData(run) {
  if (!run || !run.data || !Array.isArray(run.data)) {
    return [];
  }

  // Create a map of JSON data by throughput (in Mbps) for quick lookup
  const jsonDataMap = new Map();
  if (run.cpuData?.tests && Array.isArray(run.cpuData.tests)) {
    run.cpuData.tests.forEach((test) => {
      // Use throughput in Mbps as the key
      jsonDataMap.set(test.throughput_mbps, test);
    });
  }

  // Transform CSV data into table rows
  return run.data.map((csvRow, index) => {
    // Convert CSV throughput from bps to Mbps for matching with JSON data
    const throughputMbps = Math.round(csvRow.Requested_Throughput / 1000000);

    // Try to find matching JSON test data
    const jsonTest = jsonDataMap.get(throughputMbps);

    // Calculate throughput percentage
    const throughputPercent =
      csvRow.Requested_Throughput > 0
        ? (csvRow.Receive_Throughput / csvRow.Requested_Throughput) * 100
        : 0;

    // Extract protection domains if available
    let protectionDomains = [];
    if (jsonTest?.cores?.[0]?.protection_domains) {
      protectionDomains = jsonTest.cores[0].protection_domains.map((pd) => ({
        name: pd.name,
        totalCycles: pd.total_cycles,
        kernelCycles: pd.kernel_cycles,
        userCycles: pd.user_cycles,
        kernelEntries: pd.kernel_entries,
        schedules: pd.schedules,
        cpuUtilization: pd.cpu_utilization,
        kernelCpuUtilization: pd.kernel_cpu_utilization,
        userCpuUtilization: pd.user_cpu_utilization,
      }));
    }

    return {
      testNumber: index + 1,
      requestedThroughput: csvRow.Requested_Throughput,
      receivedThroughput: csvRow.Receive_Throughput,
      throughputPercent: throughputPercent,
      avgRTT: csvRow.Average_RTT,
      minRTT: csvRow.Minimum_RTT,
      maxRTT: csvRow.Maximum_RTT,
      stdevRTT: csvRow.Stdev_RTT,
      medianRTT: csvRow.Median_RTT,
      badPackets: csvRow.Bad_Packets,
      totalCPU: jsonTest?.system?.cpu_utilization ?? null,
      kernelCPU: jsonTest?.system?.kernel_cpu_utilization ?? null,
      userCPU: jsonTest?.system?.user_cpu_utilization ?? null,
      protectionDomains: protectionDomains,
    };
  });
}

/**
 * Gets a summary of available data fields in a table data row.
 * Useful for determining which columns to display in a table.
 *
 * @param {Array<Object>} tableData - Array of table data rows
 * @returns {Object} Object indicating which data fields are available
 * @returns {boolean} return.hasCPUData - Whether CPU data is available
 * @returns {boolean} return.hasProtectionDomains - Whether protection domain data is available
 * @returns {number} return.rowCount - Number of rows in the table
 *
 * @example
 * const summary = getTableDataSummary(tableData);
 * if (summary.hasCPUData) {
 *   // Show CPU columns
 * }
 */
export function getTableDataSummary(tableData) {
  if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
    return {
      hasCPUData: false,
      hasProtectionDomains: false,
      rowCount: 0,
    };
  }

  const firstRow = tableData[0];
  const hasCPUData = firstRow.totalCPU !== null;
  const hasProtectionDomains =
    Array.isArray(firstRow.protectionDomains) &&
    firstRow.protectionDomains.length > 0;

  return {
    hasCPUData,
    hasProtectionDomains,
    rowCount: tableData.length,
  };
}

/**
 * Filters table data rows based on a predicate function.
 *
 * @param {Array<Object>} tableData - Array of table data rows
 * @param {Function} predicate - Function that returns true for rows to keep
 * @returns {Array<Object>} Filtered array of table data rows
 *
 * @example
 * // Filter rows where throughput percentage is >= 95%
 * const filtered = filterTableData(tableData, row => row.throughputPercent >= 95);
 */
export function filterTableData(tableData, predicate) {
  if (!tableData || !Array.isArray(tableData) || typeof predicate !== "function") {
    return [];
  }
  return tableData.filter(predicate);
}

/**
 * Sorts table data rows by a specified field.
 *
 * @param {Array<Object>} tableData - Array of table data rows
 * @param {string} field - Field name to sort by
 * @param {boolean} [ascending=true] - Sort order (true for ascending, false for descending)
 * @returns {Array<Object>} Sorted array of table data rows
 *
 * @example
 * // Sort by requested throughput, descending
 * const sorted = sortTableData(tableData, 'requestedThroughput', false);
 */
export function sortTableData(tableData, field, ascending = true) {
  if (!tableData || !Array.isArray(tableData)) {
    return [];
  }

  const sorted = [...tableData];
  sorted.sort((a, b) => {
    const aVal = a[field];
    const bVal = b[field];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    if (aVal < bVal) return ascending ? -1 : 1;
    if (aVal > bVal) return ascending ? 1 : -1;
    return 0;
  });

  return sorted;
}

/**
 * Re-export formatters from formatters.js for convenience
 */
export const formatters = {
  throughput: formatThroughput,
  percentage: formatPercentage,
  microseconds: formatMicroseconds,
  number: formatNumber,
  cycles: formatCycles,
};
