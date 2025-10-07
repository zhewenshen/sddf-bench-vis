import { useState, useEffect } from "react";
import "./App.css";
import Plot from "react-plotly.js";
import RunDataTable from "./components/RunDataTable";
import { exportBenchmarkReport } from "./utils/pdfExport";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';

// Sortable Run Item Component
function SortableRunItem({ run, index, colors, onDelete, onMoveUp, onMoveDown, onClick, isFirst, canMoveUp, canMoveDown }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: run.id });

  // Constrain drag to vertical axis only
  const style = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="run-item"
      {...attributes}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          marginRight: "0.5rem",
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          disabled={!canMoveUp}
          style={{
            background: "none",
            border: "none",
            cursor: canMoveUp ? "pointer" : "default",
            opacity: canMoveUp ? 0.6 : 0.3,
            fontSize: "0.7rem",
            padding: "0.15rem",
            lineHeight: "1",
            color: "#6b6b68"
          }}
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          disabled={!canMoveDown}
          style={{
            background: "none",
            border: "none",
            cursor: canMoveDown ? "pointer" : "default",
            opacity: canMoveDown ? 0.6 : 0.3,
            fontSize: "0.7rem",
            padding: "0.15rem",
            lineHeight: "1",
            color: "#6b6b68"
          }}
          aria-label="Move down"
        >
          ▼
        </button>
      </div>
      <div
        {...listeners}
        style={{
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
          padding: "0 0.25rem",
          display: "flex",
          alignItems: "center",
          color: "#6b6b68",
          fontSize: "0.9rem",
          marginRight: "0.5rem"
        }}
        aria-label="Drag to reorder"
      >
        ⋮⋮
      </div>
      <div
        className="run-info"
        onClick={onClick}
        style={{ cursor: "pointer", borderLeftColor: colors[index % colors.length] }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
          <span
            className="run-name"
            style={{ color: colors[index % colors.length] }}
          >
            {run.name}
          </span>
          {isFirst && (
            <span
              style={{
                fontSize: "0.65rem",
                fontWeight: "600",
                color: "#c9a765",
                border: "1px solid #c9a765",
                borderRadius: "3px",
                padding: "1px 4px",
                letterSpacing: "0.02em",
                backgroundColor: "transparent"
              }}
            >
              BASELINE
            </span>
          )}
        </div>
        <span className="run-details">
          {run.data.length} points{run.cpuData ? " + CPU data" : ""}
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="delete-btn"
        aria-label="Remove run"
      >
        ×
      </button>
    </li>
  );
}

// CSV parsing function
function parseCSV(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV must have headers and data");

  const headers = lines[0].split(",").map((h) => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      const value = values[index];
      row[header] = isNaN(value) ? value : Number(value);
    });
    data.push(row);
  }

  return data;
}

function App() {
  const [message, setMessage] = useState("");
  const [runs, setRuns] = useState([]);
  const [runName, setRunName] = useState("");
  const [csvFile, setCsvFile] = useState(null);
  const [jsonFile, setJsonFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showMetadataForm, setShowMetadataForm] = useState(false);
  const [newRunMetadata, setNewRunMetadata] = useState({
    commit: "",
    hardware: "",
    dateTime: "",
    notes: "",
  });
  const [activeTab, setActiveTab] = useState("throughput");
  const [customPlots, setCustomPlots] = useState([]);
  const [showPlotDialog, setShowPlotDialog] = useState(false);
  const [newPlot, setNewPlot] = useState({
    name: "",
    selectedRuns: [],
    plotType: "xput-cpu", // "xput-cpu" or "pds"
    selectedPDs: [],
    cpuType: "total", // total, kernel, user
  });
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [savedSessions, setSavedSessions] = useState([]);
  const [pdCpuType, setPdCpuType] = useState("total"); // total, kernel, user
  const [customPlotCpuTypes, setCustomPlotCpuTypes] = useState({}); // { plotId: cpuType }
  const [showTableView, setShowTableView] = useState(false);
  const [selectedRunForTable, setSelectedRunForTable] = useState(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setRuns((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  useEffect(() => {
    fetch("http://localhost:3001/api/hello")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => console.error(err));

    // Try to load from localStorage first
    const savedState = localStorage.getItem("sddf-bench-autosave");
    if (savedState) {
      try {
        const { runs: savedRuns, customPlots: savedPlots } =
          JSON.parse(savedState);
        if (savedRuns && savedRuns.length > 0) {
          setRuns(savedRuns);
          setCustomPlots(savedPlots || []);
          return; // Skip loading test data
        }
      } catch (err) {
        console.error("Failed to restore from localStorage:", err);
      }
    }

    // Load test data by default if no saved state
    Promise.all([
      fetch("/test_data.csv").then((res) => res.text()),
      fetch("/test_data.json").then((res) => res.json()),
    ])
      .then(([csvText, jsonData]) => {
        const data = parseCSV(csvText);
        setRuns([
          {
            id: Date.now(),
            name: "Test Run",
            data: data,
            cpuData: jsonData,
            metadata: {
              commit: "",
              hardware: "",
              dateTime: new Date().toISOString().slice(0, 16),
              notes: "",
            },
          },
        ]);
      })
      .catch((err) => console.error("Failed to load test data:", err));
  }, []);

  // Auto-save to localStorage whenever runs or customPlots change
  useEffect(() => {
    if (runs.length > 0) {
      localStorage.setItem(
        "sddf-bench-autosave",
        JSON.stringify({ runs, customPlots }),
      );
    }
  }, [runs, customPlots]);

  const handleCsvFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setCsvFile(file);
    }
  };

  const handleJsonFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setJsonFile(file);
    }
  };

  const handleAddRun = async () => {
    if (!csvFile) {
      alert("Please select a CSV file");
      return;
    }

    setUploading(true);
    try {
      const csvText = await csvFile.text();
      const data = parseCSV(csvText);

      let cpuData = null;
      if (jsonFile) {
        const jsonText = await jsonFile.text();
        cpuData = JSON.parse(jsonText);
      }

      const newRun = {
        id: Date.now(),
        name: runName || `Run ${runs.length + 1}`,
        data: data,
        cpuData: cpuData,
        metadata: {
          commit: newRunMetadata.commit,
          hardware: newRunMetadata.hardware,
          dateTime: newRunMetadata.dateTime || new Date().toISOString().slice(0, 16),
          notes: newRunMetadata.notes,
        },
      };

      setRuns([...runs, newRun]);
      setRunName("");
      setCsvFile(null);
      setJsonFile(null);
      setNewRunMetadata({ commit: "", hardware: "", dateTime: "", notes: "" });
      setShowMetadataForm(false);
      // Reset file inputs
      document.getElementById("csv-upload").value = "";
      document.getElementById("json-upload").value = "";
    } catch (error) {
      alert("Failed to parse files: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteRun = (id) => {
    setRuns(runs.filter((run) => run.id !== id));
  };

  const moveRunUp = (index) => {
    if (index === 0) return;
    const newRuns = [...runs];
    [newRuns[index - 1], newRuns[index]] = [newRuns[index], newRuns[index - 1]];
    setRuns(newRuns);
  };

  const moveRunDown = (index) => {
    if (index === runs.length - 1) return;
    const newRuns = [...runs];
    [newRuns[index], newRuns[index + 1]] = [newRuns[index + 1], newRuns[index]];
    setRuns(newRuns);
  };

  const handleAddCustomPlot = () => {
    if (!newPlot.name || newPlot.selectedRuns.length === 0) {
      alert("Please provide a plot name and select at least one run");
      return;
    }

    if (newPlot.plotType === "pds" && newPlot.selectedPDs.length === 0) {
      alert("Please select at least one protection domain");
      return;
    }

    const plot = {
      id: Date.now(),
      ...newPlot,
    };

    setCustomPlots([...customPlots, plot]);
    setShowPlotDialog(false);
    setNewPlot({
      name: "",
      selectedRuns: [],
      plotType: "xput-cpu",
      selectedPDs: [],
      cpuType: "total",
    });
    setActiveTab(`custom-${plot.id}`);
  };

  const deleteCustomPlot = (id) => {
    setCustomPlots(customPlots.filter((plot) => plot.id !== id));
    if (activeTab === `custom-${id}`) {
      setActiveTab("throughput");
    }
  };

  const toggleRunSelection = (runId) => {
    setNewPlot({
      ...newPlot,
      selectedRuns: newPlot.selectedRuns.includes(runId)
        ? newPlot.selectedRuns.filter((id) => id !== runId)
        : [...newPlot.selectedRuns, runId],
    });
  };

  const togglePDSelection = (pdName) => {
    setNewPlot({
      ...newPlot,
      selectedPDs: newPlot.selectedPDs.includes(pdName)
        ? newPlot.selectedPDs.filter((name) => name !== pdName)
        : [...newPlot.selectedPDs, pdName],
    });
  };

  const handleSaveSession = async () => {
    if (!sessionName.trim()) {
      alert("Please enter a session name");
      return;
    }

    try {
      const response = await fetch("http://localhost:3001/api/session/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sessionName,
          runs,
          customPlots,
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("Session saved successfully!");
        setShowSaveDialog(false);
        setSessionName("");
      } else {
        alert("Failed to save session: " + data.error);
      }
    } catch (error) {
      alert("Failed to save session: " + error.message);
    }
  };

  const loadSessionList = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/session/list");
      const sessions = await response.json();
      setSavedSessions(sessions);
    } catch (error) {
      console.error("Failed to load session list:", error);
    }
  };

  const handleLoadSession = async (filename) => {
    try {
      const response = await fetch(
        `http://localhost:3001/api/session/load/${filename}`,
      );
      const sessionData = await response.json();

      setRuns(sessionData.runs || []);
      setCustomPlots(sessionData.customPlots || []);
      setShowLoadDialog(false);
      setActiveTab("throughput");
      alert("Session loaded successfully!");
    } catch (error) {
      alert("Failed to load session: " + error.message);
    }
  };

  const handleDeleteSession = async (filename) => {
    if (!confirm("Are you sure you want to delete this session?")) {
      return;
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/session/delete/${filename}`,
        {
          method: "DELETE",
        },
      );

      const data = await response.json();
      if (data.success) {
        loadSessionList();
      } else {
        alert("Failed to delete session: " + data.error);
      }
    } catch (error) {
      alert("Failed to delete session: " + error.message);
    }
  };

  // Prepare chart colors
  const colors = ["#8884d8", "#82ca9d", "#ffc658", "#ff7c7c", "#a28bd4"];

  // Prepare Plotly data
  const plotData = runs.map((run, index) => ({
    x: run.data.map((d) => {
      const val = d.Requested_Throughput;
      if (val >= 1e9) return `${(val / 1e9).toFixed(1)}G`;
      if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
      if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
      return val.toString();
    }),
    y: run.data.map((d) => d.Receive_Throughput),
    customdata: run.data.map((d) => [
      d.Requested_Throughput,
      d.Receive_Throughput,
    ]),
    hovertemplate:
      "<b>%{fullData.name}</b><br>" +
      "Requested: %{customdata[0]:,} bps<br>" +
      "Received: %{customdata[1]:,} bps<br>" +
      "<extra></extra>",
    type: "scatter",
    mode: "lines+markers",
    name: run.name,
    yaxis: "y",
    line: {
      color: colors[index % colors.length],
      width: 3,
    },
    marker: {
      size: 8,
      color: colors[index % colors.length],
    },
  }));

  // Add CPU utilization trace if available
  runs.forEach((run, index) => {
    if (run.cpuData?.tests) {
      // System CPU utilization
      const cpuTrace = {
        x: run.cpuData.tests.map((test) => {
          const val = test.throughput_mbps * 1e6;
          if (val >= 1e9) return `${(val / 1e9).toFixed(1)}G`;
          if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
          if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
          return val.toString();
        }),
        y: run.cpuData.tests.map((test) => test.system.cpu_utilization),
        type: "scatter",
        mode: "lines+markers",
        name: `${run.name} (CPU)`,
        yaxis: "y2",
        line: {
          color: colors[index % colors.length],
          width: 3,
          dash: "dash",
        },
        marker: {
          size: 8,
          color: colors[index % colors.length],
        },
        hovertemplate:
          `<b>${run.name} (CPU)</b><br>` +
          "Throughput: %{x}<br>" +
          "CPU: %{y:.2f}%<br>" +
          "<extra></extra>",
      };
      plotData.push(cpuTrace);
    }
  });

  // Prepare protection domain plot data
  const pdPlotData = [];
  const pdColors = [
    "#8884d8",
    "#82ca9d",
    "#ffc658",
    "#ff7c7c",
    "#a28bd4",
    "#ffb347",
    "#b19cd9",
    "#77dd77",
    "#ff6961",
    "#fdfd96",
  ];

  // Collect all unique protection domains across all runs
  const allProtectionDomains = new Map();
  runs.forEach((run) => {
    run.cpuData?.tests?.[0]?.cores?.[0]?.protection_domains?.forEach((pd) => {
      if (!allProtectionDomains.has(pd.name)) {
        allProtectionDomains.set(pd.name, true);
      }
    });
  });

  const protectionDomainsList = Array.from(allProtectionDomains.keys());
  const dashStyles = [
    "solid",
    "dash",
    "dot",
    "dashdot",
    "longdash",
    "longdashdot",
  ];

  // Determine coloring strategy based on number of PDs
  const usePDColors = protectionDomainsList.length === 1;

  protectionDomainsList.forEach((pdName, pdIndex) => {
    runs.forEach((run, runIndex) => {
      if (run.cpuData?.tests) {
        const allPDs =
          run.cpuData.tests[0]?.cores?.[0]?.protection_domains || [];
        const pdIndexInRun = allPDs.findIndex((pd) => pd.name === pdName);

        if (pdIndexInRun !== -1) {
          const getCpuValue = (test) => {
            const pd = test.cores?.[0]?.protection_domains?.[pdIndexInRun];
            if (!pd) return 0;
            if (pdCpuType === "kernel") return pd.kernel_cpu_utilization || 0;
            if (pdCpuType === "user") return pd.user_cpu_utilization || 0;
            return pd.cpu_utilization || 0;
          };

          const pdTrace = {
            x: run.cpuData.tests.map((test) => {
              const val = test.throughput_mbps * 1e6;
              if (val >= 1e9) return `${(val / 1e9).toFixed(1)}G`;
              if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
              if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
              return val.toString();
            }),
            y: run.cpuData.tests.map(getCpuValue),
            type: "scatter",
            mode: "lines+markers",
            name: `${run.name} (${pdName})`,
            line: {
              color: usePDColors
                ? colors[runIndex % colors.length]
                : pdColors[pdIndex % pdColors.length],
              width: 3,
              dash: usePDColors
                ? "solid"
                : dashStyles[runIndex % dashStyles.length],
            },
            marker: {
              size: 8,
              color: usePDColors
                ? colors[runIndex % colors.length]
                : pdColors[pdIndex % pdColors.length],
            },
            hovertemplate:
              `<b>${run.name} (${pdName})</b><br>` +
              "Throughput: %{x}<br>" +
              "CPU: %{y:.2f}%<br>" +
              "<extra></extra>",
          };
          pdPlotData.push(pdTrace);
        }
      }
    });
  });

  const pdPlotLayout = {
    title: {
      text: "Protection Domain CPU Utilization",
      font: { size: 24, color: "#333" },
    },
    xaxis: {
      type: "category",
      title: {
        text: "Requested Throughput (bps)",
        font: { size: 16 },
      },
      gridcolor: "#e0e0e0",
      showgrid: true,
    },
    yaxis: {
      title: {
        text: "CPU Utilization (%)",
        font: { size: 16 },
      },
      rangemode: "tozero",
      gridcolor: "#e0e0e0",
      showgrid: true,
    },
    hovermode: "closest",
    hoverlabel: {
      bgcolor: "white",
      bordercolor: "#333",
      font: { size: 14 },
    },
    legend: {
      orientation: "v",
      yanchor: "top",
      y: 1,
      xanchor: "left",
      x: 1.02,
      bgcolor: "rgba(255, 255, 255, 0.9)",
      bordercolor: "#ddd",
      borderwidth: 1,
    },
    margin: { l: 80, r: 150, t: 80, b: 80 },
    autosize: true,
    paper_bgcolor: "white",
    plot_bgcolor: "#fafafa",
  };

  const plotLayout = {
    title: {
      text: "Throughput Comparison",
      font: { size: 24, color: "#333" },
    },
    xaxis: {
      type: "category",
      title: {
        text: "Requested Throughput (bps)",
        font: { size: 16 },
      },
      gridcolor: "#e0e0e0",
      showgrid: true,
    },
    yaxis: {
      title: {
        text: "Received Throughput (bps)",
        font: { size: 16 },
      },
      tickformat: ".2s",
      gridcolor: "#e0e0e0",
      showgrid: true,
      rangemode: "tozero",
    },
    yaxis2: {
      title: {
        text: "CPU Utilization (%)",
        font: { size: 16 },
      },
      overlaying: "y",
      side: "right",
      range: [0, 105],
      gridcolor: "transparent",
      showgrid: false,
    },
    hovermode: "closest",
    hoverlabel: {
      bgcolor: "white",
      bordercolor: "#333",
      font: { size: 14 },
    },
    legend: {
      orientation: "v",
      yanchor: "top",
      y: 1,
      xanchor: "left",
      x: 1.02,
      bgcolor: "rgba(255, 255, 255, 0.9)",
      bordercolor: "#ddd",
      borderwidth: 1,
    },
    margin: { l: 80, r: 150, t: 80, b: 80 },
    autosize: true,
    paper_bgcolor: "white",
    plot_bgcolor: "#fafafa",
  };

  const plotConfig = {
    responsive: true,
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["lasso2d", "select2d"],
    toImageButtonOptions: {
      format: "png",
      filename: "throughput_benchmark",
      height: 1000,
      width: 1600,
      scale: 2,
    },
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>seL4 Benchmark Visualization</h1>
        <div className="header-actions">
          <button
            onClick={async (event) => {
              const btn = event.currentTarget;
              const originalText = btn.textContent;

              try {
                btn.disabled = true;
                btn.textContent = "Generating PDF...";

                console.log("Exporting PDF with", runs.length, "runs");
                await exportBenchmarkReport(runs, customPlots);
                console.log("PDF export completed");

                btn.textContent = "PDF Generated!";
                setTimeout(() => {
                  btn.textContent = originalText;
                  btn.disabled = false;
                }, 2000);
              } catch (error) {
                console.error("PDF export failed:", error);
                alert("Failed to export PDF: " + error.message);

                btn.textContent = "Export Failed";
                setTimeout(() => {
                  btn.textContent = originalText;
                  btn.disabled = runs.length === 0;
                }, 2000);
              }
            }}
            className="header-btn"
            disabled={runs.length === 0}
            title="Export complete report with plots and data"
          >
            Export PDF Report
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="header-btn"
            disabled={runs.length === 0}
          >
            Save Session
          </button>
          <button
            onClick={() => {
              setShowLoadDialog(true);
              loadSessionList();
            }}
            className="header-btn"
          >
            Load Session
          </button>
        </div>
      </div>

      <div className="sidebar">
        <div className="upload-section">
          <h2>Add New Run</h2>

          <div className="input-group">
            <input
              type="text"
              placeholder="Run name (optional)"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              style={{
                width: "100%",
                padding: "0.65rem",
                border: "2px solid #e0e0e0",
                borderRadius: "6px",
                fontSize: "0.9rem",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => e.target.style.borderColor = "#8884d8"}
              onBlur={(e) => e.target.style.borderColor = "#e0e0e0"}
            />
          </div>

          <div style={{
            background: "#f8f9fa",
            padding: "1rem",
            borderRadius: "8px",
            border: "2px dashed #d0d0d0",
            marginTop: "0.75rem"
          }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                htmlFor="csv-upload"
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: "600",
                  color: "#666",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                CSV File (Required)
              </label>
              <label
                htmlFor="csv-upload"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.75rem",
                  background: "white",
                  border: "2px solid #d0d0d0",
                  borderRadius: "6px",
                  cursor: uploading ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  fontSize: "0.85rem",
                  fontWeight: "500",
                  color: "#555",
                }}
                onMouseEnter={(e) => {
                  if (!uploading) {
                    e.currentTarget.style.borderColor = "#8884d8";
                    e.currentTarget.style.background = "#f0f7ff";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#d0d0d0";
                  e.currentTarget.style.background = "white";
                }}
              >
                {csvFile ? `✓ ${csvFile.name}` : "Choose CSV file"}
              </label>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={handleCsvFileSelect}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </div>

            <div>
              <label
                htmlFor="json-upload"
                style={{
                  display: "block",
                  fontSize: "0.8rem",
                  fontWeight: "600",
                  color: "#666",
                  marginBottom: "0.5rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                JSON File (Required)
              </label>
              <label
                htmlFor="json-upload"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.75rem",
                  background: "white",
                  border: "2px solid #d0d0d0",
                  borderRadius: "6px",
                  cursor: uploading ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  fontSize: "0.85rem",
                  fontWeight: "500",
                  color: "#555",
                }}
                onMouseEnter={(e) => {
                  if (!uploading) {
                    e.currentTarget.style.borderColor = "#8884d8";
                    e.currentTarget.style.background = "#f0f7ff";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#d0d0d0";
                  e.currentTarget.style.background = "white";
                }}
              >
                {jsonFile ? `✓ ${jsonFile.name}` : "Choose JSON file"}
              </label>
              <input
                id="json-upload"
                type="file"
                accept=".json"
                onChange={handleJsonFileSelect}
                disabled={uploading}
                style={{ display: "none" }}
              />
            </div>
          </div>

          <button
            onClick={() => setShowMetadataForm(!showMetadataForm)}
            className="add-run-btn"
            style={{
              marginTop: "0.75rem",
              width: "100%",
              padding: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: "500",
              borderRadius: "6px",
              background: showMetadataForm ? "#6c757d" : "#f8f9fa",
              color: showMetadataForm ? "white" : "#555",
              border: "1px solid #d0d0d0",
            }}
          >
            {showMetadataForm ? "Hide Metadata (Optional)" : "Add Metadata (Optional)"}
          </button>

          {showMetadataForm && (
            <div style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              background: "#f8f9fa",
              borderRadius: "6px",
              border: "1px solid #d0d0d0",
            }}>
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  color: "#666",
                  marginBottom: "0.25rem",
                }}>
                  Commit Hash
                </label>
                <input
                  type="text"
                  value={newRunMetadata.commit}
                  onChange={(e) => setNewRunMetadata({ ...newRunMetadata, commit: e.target.value })}
                  placeholder="e.g., abc123def456"
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #d0d0d0",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                  }}
                />
              </div>
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  color: "#666",
                  marginBottom: "0.25rem",
                }}>
                  Hardware
                </label>
                <input
                  type="text"
                  value={newRunMetadata.hardware}
                  onChange={(e) => setNewRunMetadata({ ...newRunMetadata, hardware: e.target.value })}
                  placeholder="e.g., Raspberry Pi 4"
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #d0d0d0",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                  }}
                />
              </div>
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  color: "#666",
                  marginBottom: "0.25rem",
                }}>
                  Date/Time
                </label>
                <input
                  type="datetime-local"
                  value={newRunMetadata.dateTime}
                  onChange={(e) => setNewRunMetadata({ ...newRunMetadata, dateTime: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #d0d0d0",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  color: "#666",
                  marginBottom: "0.25rem",
                }}>
                  Notes
                </label>
                <textarea
                  value={newRunMetadata.notes}
                  onChange={(e) => setNewRunMetadata({ ...newRunMetadata, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    border: "1px solid #d0d0d0",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleAddRun}
            disabled={uploading || !csvFile || !jsonFile}
            className="add-run-btn"
            style={{
              marginTop: "0.75rem",
              width: "100%",
              padding: "0.75rem",
              fontSize: "0.9rem",
              fontWeight: "600",
              borderRadius: "6px",
            }}
          >
            {uploading ? "Adding..." : "Add Run"}
          </button>
        </div>

        {runs.length > 0 && (
          <div className="runs-list">
            <h2>Loaded Runs ({runs.length})</h2>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            >
              <SortableContext
                items={runs.map(r => r.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul>
                  {runs.map((run, index) => (
                    <SortableRunItem
                      key={run.id}
                      run={run}
                      index={index}
                      colors={colors}
                      onDelete={() => deleteRun(run.id)}
                      onMoveUp={() => moveRunUp(index)}
                      onMoveDown={() => moveRunDown(index)}
                      onClick={() => {
                        setSelectedRunForTable(run);
                        setShowTableView(true);
                      }}
                      isFirst={index === 0}
                      canMoveUp={index > 0}
                      canMoveDown={index < runs.length - 1}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </div>

      <div className="main-content">
        {runs.length > 0 ? (
          <>
            <div className="tabs">
              <button
                className={`tab ${activeTab === "throughput" ? "active" : ""}`}
                onClick={() => setActiveTab("throughput")}
              >
                Throughput
              </button>
              {runs.some(
                (run) =>
                  run.cpuData?.tests?.[0]?.cores?.[0]?.protection_domains?.[0],
              ) && (
                <button
                  className={`tab ${activeTab === "protection-domains" ? "active" : ""}`}
                  onClick={() => setActiveTab("protection-domains")}
                >
                  Protection Domains
                </button>
              )}
              {customPlots.map((plot) => (
                <button
                  key={plot.id}
                  className={`tab ${activeTab === `custom-${plot.id}` ? "active" : ""}`}
                  onClick={() => setActiveTab(`custom-${plot.id}`)}
                >
                  {plot.name}
                  <span
                    className="tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCustomPlot(plot.id);
                    }}
                  >
                    ×
                  </span>
                </button>
              ))}
              <button
                className="tab add-tab"
                onClick={() => setShowPlotDialog(true)}
                title="Add custom plot"
              >
                +
              </button>
            </div>

            {activeTab === "throughput" && (
              <div className="chart-section">
                <Plot
                  data={plotData}
                  layout={plotLayout}
                  config={plotConfig}
                  style={{ width: "100%", height: "100%" }}
                  useResizeHandler={true}
                />
              </div>
            )}

            {activeTab === "protection-domains" && (
              <>
                <div
                  style={{
                    padding: "0.75rem 1.5rem",
                    background: "#f8f9fa",
                    borderBottom: "1px solid #e0e0e0",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <label style={{ fontWeight: 500, fontSize: "0.875rem", color: "#555" }}>
                    CPU Type:
                  </label>
                  <select
                    value={pdCpuType}
                    onChange={(e) => setPdCpuType(e.target.value)}
                    style={{
                      padding: "0.4rem 0.75rem",
                      borderRadius: "6px",
                      border: "1px solid #d0d0d0",
                      fontSize: "0.875rem",
                      backgroundColor: "white",
                      cursor: "pointer",
                      outline: "none",
                      transition: "border-color 0.2s",
                    }}
                  >
                    <option value="total">Total</option>
                    <option value="kernel">Kernel</option>
                    <option value="user">User</option>
                  </select>
                </div>
                <div className="chart-section">
                  <Plot
                    data={pdPlotData}
                    layout={pdPlotLayout}
                    config={plotConfig}
                    style={{ width: "100%", height: "100%" }}
                    useResizeHandler={true}
                  />
                </div>
              </>
            )}

            {customPlots.map((customPlot) => {
              if (activeTab !== `custom-${customPlot.id}`) return null;

              const selectedRunsData = runs.filter((run) =>
                customPlot.selectedRuns.includes(run.id),
              );

              let customPlotData = [];
              let customLayout = {};

              if (customPlot.plotType === "xput-cpu") {
                // Throughput + CPU plot
                selectedRunsData.forEach((run, index) => {
                  // Throughput trace
                  customPlotData.push({
                    x: run.data.map((d) => {
                      const val = d.Requested_Throughput;
                      if (val >= 1e9) return `${(val / 1e9).toFixed(1)}G`;
                      if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
                      if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
                      return val.toString();
                    }),
                    y: run.data.map((d) => d.Receive_Throughput),
                    customdata: run.data.map((d) => [
                      d.Requested_Throughput,
                      d.Receive_Throughput,
                    ]),
                    hovertemplate:
                      `<b>${run.name} (XPUT)</b><br>` +
                      "Requested: %{customdata[0]:,} bps<br>" +
                      "Received: %{customdata[1]:,} bps<br>" +
                      "<extra></extra>",
                    type: "scatter",
                    mode: "lines+markers",
                    name: `${run.name} (XPUT)`,
                    yaxis: "y",
                    line: { color: colors[index % colors.length], width: 3 },
                    marker: { size: 8, color: colors[index % colors.length] },
                  });

                  // CPU trace
                  if (run.cpuData?.tests) {
                    customPlotData.push({
                      x: run.cpuData.tests.map((test) => {
                        const val = test.throughput_mbps * 1e6;
                        if (val >= 1e9) return `${(val / 1e9).toFixed(1)}G`;
                        if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
                        if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
                        return val.toString();
                      }),
                      y: run.cpuData.tests.map(
                        (test) => test.system.cpu_utilization,
                      ),
                      type: "scatter",
                      mode: "lines+markers",
                      name: `${run.name} (CPU)`,
                      yaxis: "y2",
                      line: {
                        color: colors[index % colors.length],
                        width: 3,
                        dash: "dash",
                      },
                      marker: { size: 8, color: colors[index % colors.length] },
                      hovertemplate:
                        `<b>${run.name} (CPU)</b><br>` +
                        "Throughput: %{x}<br>" +
                        "CPU: %{y:.2f}%<br>" +
                        "<extra></extra>",
                    });
                  }
                });

                customLayout = {
                  title: {
                    text: customPlot.name,
                    font: { size: 24, color: "#333" },
                  },
                  xaxis: {
                    type: "category",
                    title: {
                      text: "Requested Throughput (bps)",
                      font: { size: 16 },
                    },
                    gridcolor: "#e0e0e0",
                    showgrid: true,
                  },
                  yaxis: {
                    title: {
                      text: "Received Throughput (bps)",
                      font: { size: 16 },
                    },
                    tickformat: ".2s",
                    gridcolor: "#e0e0e0",
                    showgrid: true,
                    rangemode: "tozero",
                  },
                  yaxis2: {
                    title: { text: "CPU Utilization (%)", font: { size: 16 } },
                    overlaying: "y",
                    side: "right",
                    range: [0, 105],
                    gridcolor: "transparent",
                    showgrid: false,
                  },
                  hovermode: "closest",
                  hoverlabel: {
                    bgcolor: "white",
                    bordercolor: "#333",
                    font: { size: 14 },
                  },
                  showlegend: true,
                  legend: {
                    orientation: "v",
                    yanchor: "top",
                    y: 1,
                    xanchor: "left",
                    x: 1.02,
                    bgcolor: "rgba(255, 255, 255, 0.9)",
                    bordercolor: "#ddd",
                    borderwidth: 1,
                  },
                  margin: { l: 80, r: 150, t: 80, b: 80 },
                  autosize: true,
                  paper_bgcolor: "white",
                  plot_bgcolor: "#fafafa",
                };
              } else if (customPlot.plotType === "pds") {
                // Protection domains plot
                // Collect all unique PDs from selected runs
                const allUniquePDs = new Map();
                selectedRunsData.forEach((run) => {
                  run.cpuData?.tests?.[0]?.cores?.[0]?.protection_domains?.forEach(
                    (pd) => {
                      if (!allUniquePDs.has(pd.name)) {
                        allUniquePDs.set(pd.name, true);
                      }
                    },
                  );
                });

                const allPDsList = Array.from(allUniquePDs.keys());
                const selectedPDs = allPDsList.filter((pdName) =>
                  customPlot.selectedPDs.includes(pdName),
                );

                const dashStyles = [
                  "solid",
                  "dash",
                  "dot",
                  "dashdot",
                  "longdash",
                  "longdashdot",
                ];
                const usePDColors = selectedPDs.length === 1;

                selectedPDs.forEach((pdName, pdIndex) => {
                  selectedRunsData.forEach((run, runIndex) => {
                    if (run.cpuData?.tests) {
                      const runPDs =
                        run.cpuData.tests[0]?.cores?.[0]?.protection_domains ||
                        [];
                      const pdIndexInRun = runPDs.findIndex(
                        (p) => p.name === pdName,
                      );

                      if (pdIndexInRun !== -1) {
                        const activeCpuType =
                          customPlotCpuTypes[customPlot.id] ||
                          customPlot.cpuType ||
                          "total";
                        const getCpuValue = (test) => {
                          const pd =
                            test.cores?.[0]?.protection_domains?.[pdIndexInRun];
                          if (!pd) return 0;
                          if (activeCpuType === "kernel")
                            return pd.kernel_cpu_utilization || 0;
                          if (activeCpuType === "user")
                            return pd.user_cpu_utilization || 0;
                          return pd.cpu_utilization || 0;
                        };

                        customPlotData.push({
                          x: run.cpuData.tests.map((test) => {
                            const val = test.throughput_mbps * 1e6;
                            if (val >= 1e9) return `${(val / 1e9).toFixed(1)}G`;
                            if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
                            if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
                            return val.toString();
                          }),
                          y: run.cpuData.tests.map(getCpuValue),
                          type: "scatter",
                          mode: "lines+markers",
                          name: `${run.name} (${pdName})`,
                          line: {
                            color: usePDColors
                              ? colors[runIndex % colors.length]
                              : pdColors[pdIndex % pdColors.length],
                            width: 3,
                            dash: usePDColors
                              ? "solid"
                              : dashStyles[runIndex % dashStyles.length],
                          },
                          marker: {
                            size: 8,
                            color: usePDColors
                              ? colors[runIndex % colors.length]
                              : pdColors[pdIndex % pdColors.length],
                          },
                          hovertemplate:
                            `<b>${run.name} (${pdName})</b><br>` +
                            "Throughput: %{x}<br>" +
                            "CPU: %{y:.2f}%<br>" +
                            "<extra></extra>",
                        });
                      }
                    }
                  });
                });

                customLayout = {
                  title: {
                    text: customPlot.name,
                    font: { size: 24, color: "#333" },
                  },
                  xaxis: {
                    type: "category",
                    title: {
                      text: "Requested Throughput (bps)",
                      font: { size: 16 },
                    },
                    gridcolor: "#e0e0e0",
                    showgrid: true,
                  },
                  yaxis: {
                    title: { text: "CPU Utilization (%)", font: { size: 16 } },
                    rangemode: "tozero",
                    gridcolor: "#e0e0e0",
                    showgrid: true,
                  },
                  hovermode: "closest",
                  hoverlabel: {
                    bgcolor: "white",
                    bordercolor: "#333",
                    font: { size: 14 },
                  },
                  showlegend: true,
                  legend: {
                    orientation: "v",
                    yanchor: "top",
                    y: 1,
                    xanchor: "left",
                    x: 1.02,
                    bgcolor: "rgba(255, 255, 255, 0.9)",
                    bordercolor: "#ddd",
                    borderwidth: 1,
                  },
                  margin: { l: 80, r: 150, t: 80, b: 80 },
                  autosize: true,
                  paper_bgcolor: "white",
                  plot_bgcolor: "#fafafa",
                };
              }

              // Calculate statistics for PD plots
              const calculatePDStats = () => {
                if (customPlot.plotType !== "pds" || selectedRunsData.length < 2) return null;

                const activeCpuType = customPlotCpuTypes[customPlot.id] || customPlot.cpuType || "total";
                const baselineRun = selectedRunsData[0];
                const stats = [];

                customPlot.selectedPDs.forEach(pdName => {
                  const pdStats = { pdName, comparisons: [] };

                  // Get baseline data
                  const baselinePoints = [];
                  baselineRun.cpuData?.tests?.forEach((test, testIdx) => {
                    const pd = test.cores?.[0]?.protection_domains?.find(p => p.name === pdName);
                    if (pd) {
                      const throughput = baselineRun.data[testIdx]?.Receive_Throughput || 0;
                      baselinePoints.push({
                        throughput: throughput / 1e6,
                        total: pd.cpu_utilization || 0,
                        kernel: pd.kernel_cpu_utilization || 0,
                        user: pd.user_cpu_utilization || 0
                      });
                    }
                  });

                  // Compare each other run
                  for (let i = 1; i < selectedRunsData.length; i++) {
                    const compareRun = selectedRunsData[i];
                    const comparePoints = [];

                    compareRun.cpuData?.tests?.forEach((test, testIdx) => {
                      const pd = test.cores?.[0]?.protection_domains?.find(p => p.name === pdName);
                      if (pd) {
                        const throughput = compareRun.data[testIdx]?.Receive_Throughput || 0;
                        comparePoints.push({
                          throughput: throughput / 1e6,
                          total: pd.cpu_utilization || 0,
                          kernel: pd.kernel_cpu_utilization || 0,
                          user: pd.user_cpu_utilization || 0
                        });
                      }
                    });

                    // Match points and calculate diffs
                    const diffs = [];
                    const absDiffs = [];

                    baselinePoints.forEach(basePt => {
                      const matchPt = comparePoints.reduce((closest, pt) => {
                        const diff = Math.abs(pt.throughput - basePt.throughput);
                        const closestDiff = Math.abs(closest.throughput - basePt.throughput);
                        return diff < closestDiff ? pt : closest;
                      }, comparePoints[0]);

                      if (matchPt && Math.abs(matchPt.throughput - basePt.throughput) < 1.0) {
                        const baseVal = basePt[activeCpuType];
                        const matchVal = matchPt[activeCpuType];

                        if (baseVal > 0) {
                          diffs.push(((matchVal - baseVal) / baseVal) * 100);
                        }
                        absDiffs.push(matchVal - baseVal);
                      }
                    });

                    if (diffs.length > 0) {
                      const meanRel = diffs.reduce((a, b) => a + b, 0) / diffs.length;
                      const meanAbs = absDiffs.reduce((a, b) => a + b, 0) / absDiffs.length;

                      pdStats.comparisons.push({
                        runName: compareRun.name,
                        baselineName: baselineRun.name,
                        meanRel,
                        meanAbs
                      });
                    }
                  }

                  if (pdStats.comparisons.length > 0) {
                    stats.push(pdStats);
                  }
                });

                return stats.length > 0 ? stats : null;
              };

              const pdStats = calculatePDStats();

              return (
                <div key={customPlot.id}>
                  {customPlot.plotType === "pds" && (
                    <div
                      style={{
                        padding: "0.75rem 1.5rem",
                        background: "#f8f9fa",
                        borderBottom: "1px solid #e0e0e0",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      <label style={{ fontWeight: 500, fontSize: "0.875rem", color: "#555" }}>
                        CPU Type:
                      </label>
                      <select
                        value={
                          customPlotCpuTypes[customPlot.id] ||
                          customPlot.cpuType ||
                          "total"
                        }
                        onChange={(e) =>
                          setCustomPlotCpuTypes({
                            ...customPlotCpuTypes,
                            [customPlot.id]: e.target.value,
                          })
                        }
                        style={{
                          padding: "0.4rem 0.75rem",
                          borderRadius: "6px",
                          border: "1px solid #d0d0d0",
                          fontSize: "0.875rem",
                          backgroundColor: "white",
                          cursor: "pointer",
                          outline: "none",
                          transition: "border-color 0.2s",
                        }}
                      >
                        <option value="total">Total</option>
                        <option value="kernel">Kernel</option>
                        <option value="user">User</option>
                      </select>
                    </div>
                  )}
                  <div className="chart-section" style={{ height: pdStats ? "calc(100vh - 320px)" : "calc(100vh - 220px)", minHeight: "500px" }}>
                    <Plot
                      data={customPlotData}
                      layout={customLayout}
                      config={plotConfig}
                      style={{ width: "100%", height: "100%" }}
                      useResizeHandler={true}
                    />
                  </div>
                  {pdStats && (
                    <div style={{
                      padding: "1rem 2rem",
                      background: "#fafaf8",
                      borderTop: "1px solid #e0e0e0",
                      fontSize: "0.875rem",
                      maxHeight: "150px",
                      overflowY: "auto"
                    }}>
                      <div style={{ fontWeight: "600", marginBottom: "0.75rem", color: "#191918" }}>
                        Relative Overhead vs Baseline ({customPlotCpuTypes[customPlot.id] || customPlot.cpuType || "total"} CPU):
                      </div>
                      {pdStats.map(({ pdName, comparisons }) => (
                        <div key={pdName} style={{ marginBottom: "0.75rem" }}>
                          <div style={{ fontWeight: "600", color: "#6b6b68", marginBottom: "0.25rem" }}>
                            {pdName}:
                          </div>
                          {comparisons.map((comp, idx) => (
                            <div key={idx} style={{ marginLeft: "1rem", color: "#191918", lineHeight: "1.6" }}>
                              {comp.runName} vs {comp.baselineName}: {comp.meanRel >= 0 ? '+' : ''}{comp.meanRel.toFixed(1)}% ({comp.meanAbs >= 0 ? '+' : ''}{comp.meanAbs.toFixed(2)}pp)
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <div className="empty-state">
            <h2>No Data Yet</h2>
            <p>Upload a CSV file or paste data to get started</p>
          </div>
        )}
      </div>

      {showPlotDialog && (
        <div
          className="dialog-overlay"
          onClick={() => setShowPlotDialog(false)}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Create Custom Plot</h2>

            <div className="dialog-field">
              <label>Plot Name:</label>
              <input
                type="text"
                value={newPlot.name}
                onChange={(e) =>
                  setNewPlot({ ...newPlot, name: e.target.value })
                }
                placeholder="Enter plot name"
              />
            </div>

            <div className="dialog-field">
              <label>Plot Type:</label>
              <select
                value={newPlot.plotType}
                onChange={(e) =>
                  setNewPlot({ ...newPlot, plotType: e.target.value })
                }
              >
                <option value="xput-cpu">Throughput + CPU</option>
                <option value="pds">Protection Domains</option>
              </select>
            </div>

            <div className="dialog-field">
              <label>Select Runs:</label>
              <div className="checkbox-list">
                {runs.map((run) => (
                  <label key={run.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={newPlot.selectedRuns.includes(run.id)}
                      onChange={() => toggleRunSelection(run.id)}
                    />
                    {run.name}
                  </label>
                ))}
              </div>
            </div>

            {newPlot.plotType === "pds" &&
              (() => {
                // Collect all unique protection domains from runs with CPU data
                const availablePDs = new Map();
                runs.forEach((run) => {
                  run.cpuData?.tests?.[0]?.cores?.[0]?.protection_domains?.forEach(
                    (pd) => {
                      if (!availablePDs.has(pd.name)) {
                        availablePDs.set(pd.name, true);
                      }
                    },
                  );
                });
                const pdList = Array.from(availablePDs.keys());

                return pdList.length > 0 ? (
                  <div className="dialog-field">
                    <label>Select Protection Domains:</label>
                    <div className="checkbox-list">
                      {pdList.map((pdName) => (
                        <label key={pdName} className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={newPlot.selectedPDs.includes(pdName)}
                            onChange={() => togglePDSelection(pdName)}
                          />
                          {pdName}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="dialog-field">
                    <p style={{ color: "#999", fontSize: "0.9rem" }}>
                      No protection domain data available. Upload runs with JSON
                      files to enable this option.
                    </p>
                  </div>
                );
              })()}

            <div className="dialog-actions">
              <button
                onClick={() => setShowPlotDialog(false)}
                className="btn-cancel"
              >
                Cancel
              </button>
              <button onClick={handleAddCustomPlot} className="btn-create">
                Create Plot
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveDialog && (
        <div
          className="dialog-overlay"
          onClick={() => setShowSaveDialog(false)}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Save Session</h2>
            <div className="dialog-field">
              <label>Session Name:</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Enter session name"
                autoFocus
              />
            </div>
            <div className="dialog-actions">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="btn-cancel"
              >
                Cancel
              </button>
              <button onClick={handleSaveSession} className="btn-create">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showLoadDialog && (
        <div
          className="dialog-overlay"
          onClick={() => setShowLoadDialog(false)}
        >
          <div
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ minWidth: "600px" }}
          >
            <h2>Load Session</h2>
            {savedSessions.length > 0 ? (
              <div className="session-list">
                {savedSessions.map((session) => (
                  <div key={session.filename} className="session-item">
                    <div className="session-info">
                      <div className="session-name">{session.name}</div>
                      <div className="session-details">
                        {session.runCount} runs, {session.plotCount} custom
                        plots
                        <br />
                        <span style={{ fontSize: "0.8rem", color: "#999" }}>
                          {new Date(session.savedAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="session-actions">
                      <button
                        onClick={() => handleLoadSession(session.filename)}
                        className="btn-create"
                        style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session.filename)}
                        className="btn-cancel"
                        style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p
                style={{ color: "#999", textAlign: "center", padding: "2rem" }}
              >
                No saved sessions found
              </p>
            )}
            <div className="dialog-actions">
              <button
                onClick={() => setShowLoadDialog(false)}
                className="btn-cancel"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showTableView && selectedRunForTable && (
        <RunDataTable
          run={selectedRunForTable}
          onClose={() => {
            setShowTableView(false);
            setSelectedRunForTable(null);
          }}
          onUpdateMetadata={(runId, metadata) => {
            setRuns(runs.map(run =>
              run.id === runId ? { ...run, metadata } : run
            ));
          }}
        />
      )}
    </div>
  );
}

export default App;
