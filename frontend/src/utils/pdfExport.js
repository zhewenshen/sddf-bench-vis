import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Plotly from "plotly.js-basic-dist-min";

// Simpler monochrome color scheme
const colors = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  lightGray: [240, 240, 240],
  mediumGray: [180, 180, 180],
  darkGray: [80, 80, 80]
};

/**
 * Format throughput for display
 */
function formatThroughput(bps) {
  if (bps == null || isNaN(bps)) return "N/A";

  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(0)} Mbps`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

/**
 * Calculate run statistics for summary
 */
function calculateRunStatistics(run) {
  const throughputs = run.data.map(d => d.Receive_Throughput);
  const rtts = run.data.map(d => d.Average_RTT).filter(Boolean);

  const stats = {
    testCount: run.data.length,
    minThroughput: Math.min(...throughputs),
    maxThroughput: Math.max(...throughputs),
    avgThroughput: throughputs.reduce((a, b) => a + b, 0) / throughputs.length,
    avgRTT: rtts.length > 0 ? rtts.reduce((a, b) => a + b, 0) / rtts.length : 0,
    hasCPU: !!run.cpuData?.tests
  };

  if (stats.hasCPU) {
    const cpuValues = run.cpuData.tests.map(t => t.system?.cpu_utilization || 0);
    stats.minCPU = Math.min(...cpuValues);
    stats.maxCPU = Math.max(...cpuValues);
    stats.avgCPU = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
  }

  return stats;
}

/**
 * Calculate average protection domain statistics across all tests
 */
function calculatePDAverages(run) {
  if (!run.cpuData?.tests) return [];

  const pdMap = new Map();

  run.cpuData.tests.forEach(test => {
    const pds = test.cores?.[0]?.protection_domains || [];
    pds.forEach(pd => {
      if (!pdMap.has(pd.name)) {
        pdMap.set(pd.name, {
          name: pd.name,
          totalSum: 0,
          kernelSum: 0,
          userSum: 0,
          count: 0
        });
      }
      const entry = pdMap.get(pd.name);
      entry.totalSum += pd.cpu_utilization || 0;
      entry.kernelSum += pd.kernel_cpu_utilization || 0;
      entry.userSum += pd.user_cpu_utilization || 0;
      entry.count++;
    });
  });

  return Array.from(pdMap.values()).map(pd => ({
    name: pd.name,
    avgTotal: pd.totalSum / pd.count,
    avgKernel: pd.kernelSum / pd.count,
    avgUser: pd.userSum / pd.count
  }));
}

/**
 * Create simple title page with teletype style
 */
function createTitlePage(pdf, runs, pageWidth, pageHeight, margin) {
  let yPos = margin + 10;

  // Main title - teletype style
  pdf.setFontSize(20);
  pdf.setFont("courier", "bold");
  pdf.text("BENCHMARK REPORT", margin, yPos);

  yPos += 10;
  pdf.setFontSize(10);
  pdf.setFont("courier", "normal");
  pdf.text("=" .repeat(80), margin, yPos);

  yPos += 10;

  // Metadata
  const metadata = [
    `Generated: ${new Date().toISOString()}`,
    `Total Runs: ${runs.length}`,
    `Tests per Run: ${runs[0]?.data.length || 0}`,
    `CPU Monitoring: ${runs.some(r => r.cpuData) ? 'YES' : 'NO'}`
  ];

  metadata.forEach(line => {
    pdf.text(line, margin, yPos);
    yPos += 6;
  });

  yPos += 8;
  pdf.text("-" .repeat(80), margin, yPos);
  yPos += 8;

  // Run summaries
  runs.forEach((run) => {
    const avgThroughput = run.data.reduce((sum, d) =>
      sum + d.Receive_Throughput, 0) / run.data.length;
    const avgCPU = run.cpuData?.tests ?
      run.cpuData.tests.reduce((sum, t) =>
        sum + (t.system?.cpu_utilization || 0), 0) / run.cpuData.tests.length : null;

    pdf.text(
      `${run.name}: ${formatThroughput(avgThroughput)}` +
      (avgCPU ? ` @ ${avgCPU.toFixed(1)}% CPU` : ''),
      margin,
      yPos
    );
    yPos += 6;
  });
}

/**
 * Create metadata page for all runs
 */
function createMetadataPage(pdf, runs, pageWidth, pageHeight, margin) {
  let yPos = margin + 10;

  pdf.setFontSize(14);
  pdf.setFont("courier", "bold");
  pdf.text("RUN METADATA", margin, yPos);
  yPos += 8;

  pdf.setFontSize(10);
  pdf.setFont("courier", "normal");
  pdf.text("=" .repeat(80), margin, yPos);
  yPos += 10;

  runs.forEach((run, idx) => {
    const meta = run.metadata || {};

    // Run name header
    pdf.setFont("courier", "bold");
    pdf.text(`[${idx + 1}] ${run.name}`, margin, yPos);
    yPos += 6;

    pdf.setFont("courier", "normal");

    // Format metadata fields with proper spacing
    const fields = [
      { label: "Commit Hash:", value: meta.commit || "Not specified", icon: ">" },
      { label: "Hardware:   ", value: meta.hardware || "Not specified", icon: ">" },
      {
        label: "Date/Time:  ",
        value: meta.dateTime ? new Date(meta.dateTime).toLocaleString() : "Not specified",
        icon: ">"
      },
    ];

    fields.forEach(field => {
      pdf.text(`    ${field.icon} ${field.label} ${field.value}`, margin, yPos);
      yPos += 5;
    });

    // Notes field (can be multi-line)
    if (meta.notes) {
      pdf.text(`    > Notes:`, margin, yPos);
      yPos += 5;

      // Split notes into lines if too long
      const maxWidth = pageWidth - margin * 2 - 15;
      const noteLines = pdf.splitTextToSize(`      ${meta.notes}`, maxWidth);
      noteLines.forEach(line => {
        if (yPos > pageHeight - margin - 10) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.text(line, margin, yPos);
        yPos += 5;
      });
    } else {
      pdf.text(`    > Notes:      No additional notes`, margin, yPos);
      yPos += 5;
    }

    // Separator between runs
    yPos += 3;
    if (idx < runs.length - 1) {
      pdf.text("-" .repeat(80), margin, yPos);
      yPos += 8;
    }

    // Check if we need a new page
    if (yPos > pageHeight - margin - 30 && idx < runs.length - 1) {
      pdf.addPage();
      yPos = margin + 10;
      pdf.setFontSize(14);
      pdf.setFont("courier", "bold");
      pdf.text("RUN METADATA (continued)", margin, yPos);
      yPos += 8;
      pdf.setFontSize(10);
      pdf.setFont("courier", "normal");
      pdf.text("=" .repeat(80), margin, yPos);
      yPos += 10;
    }
  });
}

/**
 * Add simple section header with teletype style
 */
function addSectionHeader(pdf, title, pageWidth, margin) {
  const yPos = margin + 5;

  pdf.setFontSize(12);
  pdf.setFont("courier", "bold");
  pdf.text(title, margin, yPos);

  pdf.setFont("courier", "normal");
  pdf.text("=" .repeat(80), margin, yPos + 4);

  return yPos + 12;
}

/**
 * Create PD comparison plot for a specific protection domain across all runs
 */
async function createPDComparisonPlot(runs, pdName) {
  const traces = [];

  runs.forEach((run, runIdx) => {
    if (!run.cpuData?.tests) return;

    const throughputs = [];
    const totalCPU = [];
    const kernelCPU = [];
    const userCPU = [];

    run.cpuData.tests.forEach((test, testIdx) => {
      const pd = test.cores?.[0]?.protection_domains?.find(p => p.name === pdName);
      if (pd) {
        const throughput = run.data[testIdx]?.Receive_Throughput || 0;
        throughputs.push(throughput / 1e6); // Convert to Mbps
        totalCPU.push(pd.cpu_utilization || 0);
        kernelCPU.push(pd.kernel_cpu_utilization || 0);
        userCPU.push(pd.user_cpu_utilization || 0);
      }
    });

    if (throughputs.length > 0) {
      traces.push({
        x: throughputs,
        y: totalCPU,
        mode: 'lines+markers',
        name: `${run.name} - Total`,
        line: { width: 2 }
      });
      traces.push({
        x: throughputs,
        y: kernelCPU,
        mode: 'lines',
        name: `${run.name} - Kernel`,
        line: { width: 1, dash: 'dash' }
      });
      traces.push({
        x: throughputs,
        y: userCPU,
        mode: 'lines',
        name: `${run.name} - User`,
        line: { width: 1, dash: 'dot' }
      });
    }
  });

  const layout = {
    title: `${pdName} - CPU Utilisation`,
    xaxis: { title: 'Throughput (Mbps)' },
    yaxis: { title: 'CPU Utilisation (%)' },
    font: { family: 'Courier New, monospace', size: 10 },
    showlegend: true,
    legend: { x: 0, y: 1 },
    margin: { l: 60, r: 20, t: 40, b: 60 }
  };

  // Create temporary div for rendering
  const div = document.createElement('div');
  div.style.width = '1200px';
  div.style.height = '600px';
  div.style.position = 'absolute';
  div.style.left = '-9999px';
  document.body.appendChild(div);

  try {
    await Plotly.newPlot(div, traces, layout, { responsive: false });

    const imgData = await Plotly.toImage(div, {
      format: 'svg',
      width: 1200,
      height: 600,
      scale: 4  // High resolution
    });

    document.body.removeChild(div);
    return imgData;
  } catch (error) {
    document.body.removeChild(div);
    throw error;
  }
}

/**
 * Capture Plotly chart as SVG
 */
async function capturePlotToPDF(pdf, plotElement, title, yPosition, pageWidth, pageHeight, margin) {
  try {
    const imgData = await Plotly.toImage(plotElement, {
      format: 'svg',
      width: 1600,
      height: 800,
      scale: 4  // High resolution
    });

    pdf.setFontSize(10);
    pdf.setFont("courier", "bold");
    pdf.text(title, margin, yPosition);
    yPosition += 8;

    const imgWidth = pageWidth - (2 * margin);
    const imgHeight = (800 * imgWidth) / 1600;

    if (yPosition + imgHeight > pageHeight - margin) {
      pdf.addPage('l');
      yPosition = margin;
      pdf.setFontSize(10);
      pdf.setFont("courier", "bold");
      pdf.text(title, margin, yPosition);
      yPosition += 8;
    }

    pdf.addImage(imgData, 'SVG', margin, yPosition, imgWidth, imgHeight, undefined, 'FAST');

    return yPosition + imgHeight + 10;
  } catch (error) {
    console.error("Error capturing plot:", error);
    pdf.setFontSize(8);
    pdf.setFont("courier", "normal");
    pdf.text("(Chart unavailable)", margin, yPosition);
    return yPosition + 10;
  }
}

/**
 * Add generated SVG plot to PDF
 */
async function addGeneratedPlotToPDF(pdf, imgData, title, yPosition, pageWidth, pageHeight, margin) {
  try {
    pdf.setFontSize(10);
    pdf.setFont("courier", "bold");
    pdf.text(title, margin, yPosition);
    yPosition += 8;

    const imgWidth = pageWidth - (2 * margin);
    const imgHeight = (600 * imgWidth) / 1200;

    if (yPosition + imgHeight > pageHeight - margin) {
      pdf.addPage('l');
      yPosition = margin;
      pdf.setFontSize(10);
      pdf.setFont("courier", "bold");
      pdf.text(title, margin, yPosition);
      yPosition += 8;
    }

    pdf.addImage(imgData, 'SVG', margin, yPosition, imgWidth, imgHeight, undefined, 'FAST');

    return yPosition + imgHeight + 10;
  } catch (error) {
    console.error("Error adding plot:", error);
    return yPosition + 10;
  }
}

/**
 * Get all unique protection domains across all runs
 */
function getAllProtectionDomains(runs) {
  const pdSet = new Set();
  runs.forEach(run => {
    if (run.cpuData?.tests?.[0]?.cores?.[0]?.protection_domains) {
      run.cpuData.tests[0].cores[0].protection_domains.forEach(pd => {
        pdSet.add(pd.name);
      });
    }
  });
  return Array.from(pdSet).sort();
}

/**
 * Export benchmark report as PDF with plots only (no tables)
 */
export async function exportBenchmarkReport(runs, customPlots) {
  try {
    if (!runs || runs.length === 0) {
      throw new Error("No run data available to export");
    }

    // Create PDF in landscape mode
    const pdf = new jsPDF("l", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;

    // ===== TITLE PAGE =====
    createTitlePage(pdf, runs, pageWidth, pageHeight, margin);

    // ===== METADATA PAGE =====
    pdf.addPage('l');
    createMetadataPage(pdf, runs, pageWidth, pageHeight, margin);

    // ===== SECTION 1: MAIN THROUGHPUT PLOT =====
    pdf.addPage('l');
    let yPosition = addSectionHeader(pdf, "THROUGHPUT vs CPU UTILISATION", pageWidth, margin);

    // Capture main throughput plot only (skip PD overview plot)
    const allPlotElements = document.querySelectorAll('.js-plotly-plot');

    if (allPlotElements.length > 0) {
      // Main throughput plot
      yPosition = await capturePlotToPDF(
        pdf,
        allPlotElements[0],
        "System Throughput vs CPU Utilisation",
        yPosition,
        pageWidth,
        pageHeight,
        margin
      );

      // Add system-level summary stats
      yPosition += 5;
      pdf.setFontSize(9);
      pdf.setFont("courier", "normal");

      runs.forEach(run => {
        if (run.cpuData?.tests) {
          const avgCPU = run.cpuData.tests.reduce((sum, t) =>
            sum + (t.system?.cpu_utilization || 0), 0) / run.cpuData.tests.length;
          const avgThroughput = run.data.reduce((sum, d) =>
            sum + d.Receive_Throughput, 0) / run.data.length;

          pdf.text(
            `${run.name}: Avg ${avgCPU.toFixed(2)}% CPU @ ${formatThroughput(avgThroughput)}`,
            margin,
            yPosition
          );
          yPosition += 5;
        }
      });
    }

    // ===== SECTION 2: PROTECTION DOMAIN COMPARISON PLOTS =====
    const allPDs = getAllProtectionDomains(runs);

    if (allPDs.length > 0) {
      for (const pdName of allPDs) {
        pdf.addPage('l');
        yPosition = margin;

        pdf.setFontSize(12);
        pdf.setFont("courier", "bold");
        pdf.text(`PROTECTION DOMAIN: ${pdName}`, margin, yPosition);
        yPosition += 8;

        try {
          const imgData = await createPDComparisonPlot(runs, pdName);
          yPosition = await addGeneratedPlotToPDF(
            pdf,
            imgData,
            `CPU Utilisation (Total, Kernel, User)`,
            yPosition,
            pageWidth,
            pageHeight,
            margin
          );

          // Add new page for statistics
          pdf.addPage('l');
          yPosition = margin;

          pdf.setFontSize(12);
          pdf.setFont("courier", "bold");
          pdf.text(`STATISTICS: ${pdName}`, margin, yPosition);
          yPosition += 10;

          // Calculate and display statistics for this PD
          pdf.setFontSize(9);
          pdf.setFont("courier", "normal");

          // Per-run statistics
          runs.forEach((run, idx) => {
            if (!run.cpuData?.tests) return;

            let totalSum = 0, kernelSum = 0, userSum = 0, count = 0;

            run.cpuData.tests.forEach(test => {
              const pd = test.cores?.[0]?.protection_domains?.find(p => p.name === pdName);
              if (pd) {
                totalSum += pd.cpu_utilization || 0;
                kernelSum += pd.kernel_cpu_utilization || 0;
                userSum += pd.user_cpu_utilization || 0;
                count++;
              }
            });

            if (count > 0) {
              const avgTotal = totalSum / count;
              const avgKernel = kernelSum / count;
              const avgUser = userSum / count;
              const kernelPct = avgTotal > 0 ? (avgKernel / avgTotal) * 100 : 0;
              const userPct = avgTotal > 0 ? (avgUser / avgTotal) * 100 : 0;

              pdf.text(
                `${run.name}: Avg ${avgTotal.toFixed(2)}% total (${kernelPct.toFixed(1)}% kernel, ${userPct.toFixed(1)}% user)`,
                margin,
                yPosition
              );
              yPosition += 6;
            }
          });

          // Comparison stats if multiple runs
          if (runs.length > 1) {
            yPosition += 5;
            pdf.setFont("courier", "bold");
            pdf.text("Relative Overhead vs Baseline:", margin, yPosition);
            yPosition += 8;
            pdf.setFont("courier", "normal");

            // Calculate point-by-point differences, then average them
            const baselineRun = runs[0];
            if (!baselineRun.cpuData?.tests) return;

            // Build baseline data points
            const baselinePoints = [];
            baselineRun.cpuData.tests.forEach((test, testIdx) => {
              const pd = test.cores?.[0]?.protection_domains?.find(p => p.name === pdName);
              if (pd) {
                const throughput = baselineRun.data[testIdx]?.Receive_Throughput || 0;
                baselinePoints.push({
                  throughput: throughput / 1e6, // Mbps
                  total: pd.cpu_utilization || 0,
                  kernel: pd.kernel_cpu_utilization || 0,
                  user: pd.user_cpu_utilization || 0
                });
              }
            });

            // Compare each other run
            for (let i = 1; i < runs.length; i++) {
              const compareRun = runs[i];
              if (!compareRun.cpuData?.tests) continue;

              // Build comparison data points
              const comparePoints = [];
              compareRun.cpuData.tests.forEach((test, testIdx) => {
                const pd = test.cores?.[0]?.protection_domains?.find(p => p.name === pdName);
                if (pd) {
                  const throughput = compareRun.data[testIdx]?.Receive_Throughput || 0;
                  comparePoints.push({
                    throughput: throughput / 1e6, // Mbps
                    total: pd.cpu_utilization || 0,
                    kernel: pd.kernel_cpu_utilization || 0,
                    user: pd.user_cpu_utilization || 0
                  });
                }
              });

              // Match points by throughput and calculate differences
              const totalDiffs = [], kernelDiffs = [], userDiffs = [];
              const totalAbsDiffs = [], kernelAbsDiffs = [], userAbsDiffs = [];

              baselinePoints.forEach(basePt => {
                // Find closest matching throughput point in comparison run
                const matchPt = comparePoints.reduce((closest, pt) => {
                  const diff = Math.abs(pt.throughput - basePt.throughput);
                  const closestDiff = Math.abs(closest.throughput - basePt.throughput);
                  return diff < closestDiff ? pt : closest;
                }, comparePoints[0]);

                if (matchPt && Math.abs(matchPt.throughput - basePt.throughput) < 1.0) { // Within 1 Mbps
                  // Total CPU
                  if (basePt.total > 0) {
                    totalDiffs.push(((matchPt.total - basePt.total) / basePt.total) * 100);
                  }
                  totalAbsDiffs.push(matchPt.total - basePt.total);

                  // Kernel CPU
                  if (basePt.kernel > 0) {
                    kernelDiffs.push(((matchPt.kernel - basePt.kernel) / basePt.kernel) * 100);
                  }
                  kernelAbsDiffs.push(matchPt.kernel - basePt.kernel);

                  // User CPU
                  if (basePt.user > 0) {
                    userDiffs.push(((matchPt.user - basePt.user) / basePt.user) * 100);
                  }
                  userAbsDiffs.push(matchPt.user - basePt.user);
                }
              });

              // Calculate mean of differences
              if (totalDiffs.length > 0) {
                const meanTotalRel = totalDiffs.reduce((a, b) => a + b, 0) / totalDiffs.length;
                const meanTotalAbs = totalAbsDiffs.reduce((a, b) => a + b, 0) / totalAbsDiffs.length;
                const meanKernelRel = kernelDiffs.length > 0 ? kernelDiffs.reduce((a, b) => a + b, 0) / kernelDiffs.length : 0;
                const meanKernelAbs = kernelAbsDiffs.reduce((a, b) => a + b, 0) / kernelAbsDiffs.length;
                const meanUserRel = userDiffs.length > 0 ? userDiffs.reduce((a, b) => a + b, 0) / userDiffs.length : 0;
                const meanUserAbs = userAbsDiffs.reduce((a, b) => a + b, 0) / userAbsDiffs.length;

                pdf.text(
                  `${compareRun.name} vs ${baselineRun.name}:`,
                  margin,
                  yPosition
                );
                yPosition += 6;

                pdf.text(
                  `  Total:  ${meanTotalRel >= 0 ? '+' : ''}${meanTotalRel.toFixed(1)}% (${meanTotalAbs >= 0 ? '+' : ''}${meanTotalAbs.toFixed(2)}pp)`,
                  margin + 5,
                  yPosition
                );
                yPosition += 5;

                pdf.text(
                  `  Kernel: ${meanKernelRel >= 0 ? '+' : ''}${meanKernelRel.toFixed(1)}% (${meanKernelAbs >= 0 ? '+' : ''}${meanKernelAbs.toFixed(2)}pp)`,
                  margin + 5,
                  yPosition
                );
                yPosition += 5;

                pdf.text(
                  `  User:   ${meanUserRel >= 0 ? '+' : ''}${meanUserRel.toFixed(1)}% (${meanUserAbs >= 0 ? '+' : ''}${meanUserAbs.toFixed(2)}pp)`,
                  margin + 5,
                  yPosition
                );
                yPosition += 8;
              }
            }
          }

        } catch (error) {
          console.error(`Failed to create plot for ${pdName}:`, error);
          pdf.setFont("courier", "normal");
          pdf.text(`Failed to generate plot for ${pdName}`, margin, yPosition);
        }
      }
    }

    // Save PDF
    const timestamp = new Date().toISOString().split('T')[0];
    pdf.save(`Benchmark_Report_${timestamp}.pdf`);

  } catch (error) {
    console.error("PDF Export Error:", error);
    alert(`Failed to generate PDF report: ${error.message}\n\nPlease check the console for details.`);
    throw error;
  }
}
