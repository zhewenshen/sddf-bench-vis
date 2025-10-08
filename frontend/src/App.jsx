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

  // Session management
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessions, setSessions] = useState({});
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState("");

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
    plotType: "xput-cpu", // "xput-cpu", "pds", or "cache"
    selectedPDs: [],
    cpuType: "total", // total, kernel, user
    cacheMetrics: [], // selected cache metrics for cache plots
  });
  const [pdCpuType, setPdCpuType] = useState("total"); // total, kernel, user
  const [customPlotCpuTypes, setCustomPlotCpuTypes] = useState({}); // { plotId: cpuType }
  const [customPlotPdTypes, setCustomPlotPdTypes] = useState({}); // { plotId: "bar" or "line" }
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

  // Initialize sessions from backend
  useEffect(() => {
    fetch("http://localhost:3001/api/hello")
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => console.error(err));

    // Load sessions from backend
    console.log("[PERSISTENCE] Loading sessions from backend...");
    fetch("http://localhost:3001/api/sessions")
      .then((res) => res.json())
      .then((loadedSessions) => {
        console.log("[PERSISTENCE] Loaded sessions:", Object.keys(loadedSessions).length, "sessions");
        if (Object.keys(loadedSessions).length > 0) {
          setSessions(loadedSessions);

          // Load the last updated session or first available
          const sortedIds = Object.keys(loadedSessions).sort(
            (a, b) => new Date(loadedSessions[b].updatedAt) - new Date(loadedSessions[a].updatedAt)
          );
          const sessionId = sortedIds[0];
          console.log("[PERSISTENCE] Loading most recent session:", sessionId);

          setCurrentSessionId(sessionId);
          loadSession(sessionId, loadedSessions);
        } else {
          console.log("[PERSISTENCE] No existing sessions, creating default session");
          // Create default session with test data if no sessions exist
          Promise.all([
            fetch("/test_data.csv").then((res) => res.text()),
            fetch("/test_data.json").then((res) => res.json()),
          ])
            .then(([csvText, jsonData]) => {
              const data = parseCSV(csvText);
              const defaultSessionId = `session-${Date.now()}`;
              const defaultSession = {
                id: defaultSessionId,
                name: "Test Data",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                runs: [
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
                ],
                customPlots: [],
              };

              const newSessions = { [defaultSessionId]: defaultSession };
              setSessions(newSessions);
              setCurrentSessionId(defaultSessionId);
              setRuns(defaultSession.runs);
              setCustomPlots(defaultSession.customPlots);

              // Save to backend
              console.log("[PERSISTENCE] Saving default session to backend");
              fetch("http://localhost:3001/api/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(defaultSession),
              })
                .then(() => console.log("[PERSISTENCE] Default session saved"))
                .catch((err) => console.error("[PERSISTENCE] Failed to save default session:", err));
            })
            .catch((err) => console.error("Failed to load test data:", err));
        }
      })
      .catch((err) => {
        console.error("Failed to load sessions from backend:", err);
      });
  }, []);

  // Helper to load a session's data
  const loadSession = (sessionId, sessionsData = sessions) => {
    const session = sessionsData[sessionId];
    if (session) {
      setRuns(session.runs || []);
      setCustomPlots(session.customPlots || []);
      setActiveTab("throughput");
    }
  };

  // Auto-save current session whenever runs or customPlots change
  const [lastSaved, setLastSaved] = useState(null);
  useEffect(() => {
    if (currentSessionId && sessions[currentSessionId]) {
      const updatedSession = {
        ...sessions[currentSessionId],
        runs,
        customPlots,
        updatedAt: new Date().toISOString(),
      };

      const updatedSessions = {
        ...sessions,
        [currentSessionId]: updatedSession,
      };

      setSessions(updatedSessions);

      // Save to backend
      console.log("[PERSISTENCE] Autosaving session:", currentSessionId);
      fetch("http://localhost:3001/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedSession),
      })
        .then(() => {
          console.log("[PERSISTENCE] Autosave complete");
          setLastSaved(new Date());
        })
        .catch((err) => console.error("[PERSISTENCE] Autosave failed:", err));
    }
  }, [runs, customPlots, currentSessionId]);

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

    if (newPlot.plotType === "cache" && newPlot.cacheMetrics.length === 0) {
      alert("Please select at least one cache metric");
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
      cacheMetrics: [],
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

  const toggleCacheMetricSelection = (metricName) => {
    setNewPlot({
      ...newPlot,
      cacheMetrics: newPlot.cacheMetrics.includes(metricName)
        ? newPlot.cacheMetrics.filter((name) => name !== metricName)
        : [...newPlot.cacheMetrics, metricName],
    });
  };

  // Session management functions
  const createNewSession = () => {
    const newSessionId = `session-${Date.now()}`;
    const newSession = {
      id: newSessionId,
      name: `Benchmark ${Object.keys(sessions).length + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      runs: [],
      customPlots: [],
    };

    const updatedSessions = { ...sessions, [newSessionId]: newSession };
    setSessions(updatedSessions);
    setCurrentSessionId(newSessionId);
    setRuns([]);
    setCustomPlots([]);

    // Save to backend
    console.log("[PERSISTENCE] Creating new session:", newSessionId);
    fetch("http://localhost:3001/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newSession),
    })
      .then(() => console.log("[PERSISTENCE] New session created"))
      .catch((err) => console.error("[PERSISTENCE] Failed to create session:", err));

    setShowSessionMenu(false);
  };

  const switchSession = (sessionId) => {
    setCurrentSessionId(sessionId);
    loadSession(sessionId);
    setShowSessionMenu(false);
  };

  const renameSession = () => {
    if (!renameValue.trim()) return;

    const updatedSession = {
      ...sessions[currentSessionId],
      name: renameValue.trim(),
      updatedAt: new Date().toISOString(),
    };

    const updatedSessions = { ...sessions, [currentSessionId]: updatedSession };
    setSessions(updatedSessions);

    // Save to backend
    console.log("[PERSISTENCE] Renaming session:", currentSessionId);
    fetch("http://localhost:3001/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedSession),
    })
      .then(() => console.log("[PERSISTENCE] Session renamed"))
      .catch((err) => console.error("[PERSISTENCE] Failed to rename session:", err));

    setShowRenameDialog(false);
    setRenameValue("");
  };

  const duplicateSession = () => {
    const currentSession = sessions[currentSessionId];
    const newSessionId = `session-${Date.now()}`;
    const duplicatedSession = {
      ...currentSession,
      id: newSessionId,
      name: `${currentSession.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedSessions = { ...sessions, [newSessionId]: duplicatedSession };
    setSessions(updatedSessions);
    setCurrentSessionId(newSessionId);
    loadSession(newSessionId, updatedSessions);

    // Save to backend
    console.log("[PERSISTENCE] Duplicating session:", newSessionId);
    fetch("http://localhost:3001/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(duplicatedSession),
    })
      .then(() => console.log("[PERSISTENCE] Session duplicated"))
      .catch((err) => console.error("[PERSISTENCE] Failed to duplicate session:", err));

    setShowSessionMenu(false);
  };

  const deleteSession = (sessionId) => {
    if (Object.keys(sessions).length === 1) {
      alert("Cannot delete the only session");
      return;
    }

    if (!confirm(`Delete session "${sessions[sessionId].name}"?`)) {
      return;
    }

    const updatedSessions = { ...sessions };
    delete updatedSessions[sessionId];

    // Switch to another session if deleting current
    if (sessionId === currentSessionId) {
      const newCurrentId = Object.keys(updatedSessions)[0];
      setCurrentSessionId(newCurrentId);
      loadSession(newCurrentId, updatedSessions);
    }

    setSessions(updatedSessions);

    // Delete from backend
    console.log("[PERSISTENCE] Deleting session:", sessionId);
    fetch(`http://localhost:3001/api/sessions/${sessionId}`, {
      method: "DELETE",
    })
      .then(() => console.log("[PERSISTENCE] Session deleted"))
      .catch((err) => console.error("[PERSISTENCE] Failed to delete session:", err));

    setShowSessionMenu(false);
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
      text: "Protection Domain CPU Utilisation",
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
        text: "CPU Utilisation (%)",
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
        text: "CPU Utilisation (%)",
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
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1>Benchmark Visualisation</h1>
          {lastSaved && (
            <span style={{
              fontSize: "0.7rem",
              color: "#6b6b68",
              fontWeight: "400",
              opacity: 0.7
            }}>
              Saved {lastSaved.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Session Selector */}
          {currentSessionId && sessions[currentSessionId] && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#6b6b68", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>Session:</span>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowSessionMenu(!showSessionMenu)}
                  style={{
                    padding: "0.35rem 0.65rem",
                    background: "#fafaf8",
                    border: "1px solid #e0e0d8",
                    borderRadius: "2px",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    color: "#191918",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    transition: "all 0.15s",
                    minWidth: "140px",
                    fontFamily: "monospace"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f4f4f2";
                    e.currentTarget.style.borderColor = "#191918";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fafaf8";
                    e.currentTarget.style.borderColor = "#e0e0d8";
                  }}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>{sessions[currentSessionId].name}</span>
                  <span style={{ fontSize: "0.6rem", opacity: 0.5 }}>▼</span>
                </button>

                {showSessionMenu && (
                  <>
                    <div
                      style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 998
                      }}
                      onClick={() => setShowSessionMenu(false)}
                    />
                    <div style={{
                      position: "absolute",
                      top: "calc(100% + 0.5rem)",
                      right: 0,
                      background: "#fafaf8",
                      border: "2px solid #191918",
                      borderRadius: "0",
                      boxShadow: "4px 4px 0 rgba(25, 25, 24, 0.15)",
                      minWidth: "340px",
                      zIndex: 999,
                      maxHeight: "450px",
                      overflowY: "auto",
                      fontFamily: "monospace"
                    }}>
                      {/* Header */}
                      <div style={{
                        padding: "0.75rem 1rem",
                        borderBottom: "2px solid #191918",
                        background: "#191918",
                        color: "#f4f4f2"
                      }}>
                        <div style={{ fontSize: "0.75rem", fontWeight: "600", textTransform: "uppercase", letterSpacing: "1px" }}>
                          Sessions
                        </div>
                      </div>

                      {/* New Session Button */}
                      <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e0e0d8" }}>
                        <button
                          onClick={createNewSession}
                          style={{
                            width: "100%",
                            padding: "0.5rem",
                            background: "#191918",
                            color: "#f4f4f2",
                            border: "1px solid #191918",
                            borderRadius: "0",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            cursor: "pointer",
                            transition: "all 0.15s",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#f4f4f2";
                            e.currentTarget.style.color = "#191918";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "#191918";
                            e.currentTarget.style.color = "#f4f4f2";
                          }}
                        >
                          + New Session
                        </button>
                      </div>

                      {/* Session List */}
                      <div style={{ padding: "0.5rem 0.75rem" }}>
                        {Object.values(sessions)
                          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                          .map((session) => {
                            const isActive = session.id === currentSessionId;
                            return (
                              <div
                                key={session.id}
                                style={{
                                  margin: "0.35rem 0",
                                  padding: "0.65rem 0.75rem",
                                  background: isActive ? "#f4f4f2" : "transparent",
                                  border: isActive ? "1px solid #191918" : "1px solid #e0e0d8",
                                  borderRadius: "0",
                                  cursor: "pointer",
                                  transition: "all 0.15s"
                                }}
                                onMouseEnter={(e) => {
                                  if (!isActive) {
                                    e.currentTarget.style.background = "#f4f4f2";
                                    e.currentTarget.style.borderColor = "#191918";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isActive) {
                                    e.currentTarget.style.background = "transparent";
                                    e.currentTarget.style.borderColor = "#e0e0d8";
                                  }
                                }}
                              >
                                <div onClick={() => switchSession(session.id)} style={{ marginBottom: "0.5rem" }}>
                                  <div style={{
                                    fontWeight: "700",
                                    color: "#191918",
                                    marginBottom: "0.25rem",
                                    fontSize: "0.8rem",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.5rem"
                                  }}>
                                    <span>{session.name}</span>
                                    {isActive && (
                                      <span style={{
                                        fontSize: "0.6rem",
                                        color: "#6b6b68",
                                        fontWeight: "500",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.5px"
                                      }}>
                                        [active]
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: "0.65rem", color: "#6b6b68", letterSpacing: "0.3px" }}>
                                    {session.runs?.length || 0} run{(session.runs?.length || 0) !== 1 ? 's' : ''} • {new Date(session.updatedAt).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div style={{ display: "flex", gap: "0.35rem" }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRenameValue(session.name);
                                      setShowRenameDialog(true);
                                      setShowSessionMenu(false);
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: "0.35rem",
                                      background: "transparent",
                                      border: "1px solid #c0c0b8",
                                      borderRadius: "0",
                                      fontSize: "0.65rem",
                                      cursor: "pointer",
                                      fontWeight: "600",
                                      color: "#191918",
                                      transition: "all 0.15s",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.3px"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = "#191918";
                                      e.currentTarget.style.color = "#f4f4f2";
                                      e.currentTarget.style.borderColor = "#191918";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "transparent";
                                      e.currentTarget.style.color = "#191918";
                                      e.currentTarget.style.borderColor = "#c0c0b8";
                                    }}
                                  >
                                    Rename
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      duplicateSession();
                                    }}
                                    style={{
                                      flex: 1,
                                      padding: "0.35rem",
                                      background: "transparent",
                                      border: "1px solid #c0c0b8",
                                      borderRadius: "0",
                                      fontSize: "0.65rem",
                                      cursor: "pointer",
                                      fontWeight: "600",
                                      color: "#191918",
                                      transition: "all 0.15s",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.3px"
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = "#191918";
                                      e.currentTarget.style.color = "#f4f4f2";
                                      e.currentTarget.style.borderColor = "#191918";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = "transparent";
                                      e.currentTarget.style.color = "#191918";
                                      e.currentTarget.style.borderColor = "#c0c0b8";
                                    }}
                                  >
                                    Copy
                                  </button>
                                  {Object.keys(sessions).length > 1 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSession(session.id);
                                      }}
                                      style={{
                                        padding: "0.35rem 0.5rem",
                                        background: "transparent",
                                        border: "1px solid #c0c0b8",
                                        borderRadius: "0",
                                        fontSize: "0.65rem",
                                        cursor: "pointer",
                                        fontWeight: "600",
                                        color: "#8b0000",
                                        transition: "all 0.15s",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.3px"
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = "#8b0000";
                                        e.currentTarget.style.color = "#f4f4f2";
                                        e.currentTarget.style.borderColor = "#8b0000";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = "#8b0000";
                                        e.currentTarget.style.borderColor = "#c0c0b8";
                                      }}
                                    >
                                      Del
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
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
        </div>
      </div>

      <div className="sidebar">
        <div className="upload-section">
          <h2>Add New Run</h2>

          <div className="input-group">
            <label>Run Name</label>
            <input
              type="text"
              placeholder="Optional"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
            />
          </div>

          <div style={{
            background: "#ffffff",
            padding: "0.75rem",
            border: "2px solid #191918",
            marginTop: "0.75rem",
            boxShadow: "2px 2px 0 rgba(25, 25, 24, 0.1)"
          }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <label
                htmlFor="csv-upload"
                style={{
                  display: "block",
                  fontSize: "0.65rem",
                  fontWeight: "700",
                  color: "#191918",
                  marginBottom: "0.4rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}
              >
                [1] CSV File *
              </label>
              <label
                htmlFor="csv-upload"
                style={{
                  display: "block",
                  padding: "0.5rem",
                  background: csvFile ? "#f4f4f2" : "#fafaf8",
                  border: `1px solid ${csvFile ? "#191918" : "#c0c0b8"}`,
                  borderRadius: "0",
                  cursor: uploading ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  fontSize: "0.7rem",
                  fontWeight: csvFile ? "700" : "500",
                  color: "#191918",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  if (!uploading && !csvFile) {
                    e.currentTarget.style.borderColor = "#191918";
                    e.currentTarget.style.background = "#f4f4f2";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!csvFile) {
                    e.currentTarget.style.borderColor = "#c0c0b8";
                    e.currentTarget.style.background = "#fafaf8";
                  }
                }}
              >
                {csvFile ? `[✓] ${csvFile.name}` : "[ SELECT CSV FILE ]"}
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
                  fontSize: "0.65rem",
                  fontWeight: "700",
                  color: "#191918",
                  marginBottom: "0.4rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}
              >
                [2] JSON File *
              </label>
              <label
                htmlFor="json-upload"
                style={{
                  display: "block",
                  padding: "0.5rem",
                  background: jsonFile ? "#f4f4f2" : "#fafaf8",
                  border: `1px solid ${jsonFile ? "#191918" : "#c0c0b8"}`,
                  borderRadius: "0",
                  cursor: uploading ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  fontSize: "0.7rem",
                  fontWeight: jsonFile ? "700" : "500",
                  color: "#191918",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  if (!uploading && !jsonFile) {
                    e.currentTarget.style.borderColor = "#191918";
                    e.currentTarget.style.background = "#f4f4f2";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!jsonFile) {
                    e.currentTarget.style.borderColor = "#c0c0b8";
                    e.currentTarget.style.background = "#fafaf8";
                  }
                }}
              >
                {jsonFile ? `[✓] ${jsonFile.name}` : "[ SELECT JSON FILE ]"}
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
            style={{
              marginTop: "0.75rem",
              width: "100%",
              padding: "0.5rem",
              fontSize: "0.7rem",
              fontWeight: "700",
              borderRadius: "0",
              background: showMetadataForm ? "#191918" : "transparent",
              color: showMetadataForm ? "#f4f4f2" : "#191918",
              border: "1px solid #c0c0b8",
              cursor: "pointer",
              transition: "all 0.15s",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}
            onMouseEnter={(e) => {
              if (!showMetadataForm) {
                e.currentTarget.style.background = "#f4f4f2";
                e.currentTarget.style.borderColor = "#191918";
              }
            }}
            onMouseLeave={(e) => {
              if (!showMetadataForm) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "#c0c0b8";
              }
            }}
          >
            {showMetadataForm ? "[−] Hide Metadata" : "[+] Add Metadata (Optional)"}
          </button>

          {showMetadataForm && (
            <div style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              background: "#ffffff",
              borderRadius: "0",
              border: "2px solid #191918",
              boxShadow: "2px 2px 0 rgba(25, 25, 24, 0.1)"
            }}>
              <div style={{ marginBottom: "0.6rem" }}>
                <label style={{
                  display: "block",
                  fontSize: "0.65rem",
                  fontWeight: "700",
                  color: "#191918",
                  marginBottom: "0.3rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  Commit Hash
                </label>
                <input
                  type="text"
                  value={newRunMetadata.commit}
                  onChange={(e) => setNewRunMetadata({ ...newRunMetadata, commit: e.target.value })}
                  placeholder="abc123def456"
                  style={{
                    width: "100%",
                    padding: "0.45rem",
                    border: "1px solid #c0c0b8",
                    borderRadius: "0",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    background: "#fafaf8"
                  }}
                />
              </div>
              <div style={{ marginBottom: "0.6rem" }}>
                <label style={{
                  display: "block",
                  fontSize: "0.65rem",
                  fontWeight: "700",
                  color: "#191918",
                  marginBottom: "0.3rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  Hardware
                </label>
                <input
                  type="text"
                  value={newRunMetadata.hardware}
                  onChange={(e) => setNewRunMetadata({ ...newRunMetadata, hardware: e.target.value })}
                  placeholder="Raspberry Pi 4"
                  style={{
                    width: "100%",
                    padding: "0.45rem",
                    border: "1px solid #c0c0b8",
                    borderRadius: "0",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    background: "#fafaf8"
                  }}
                />
              </div>
              <div style={{ marginBottom: "0.6rem" }}>
                <label style={{
                  display: "block",
                  fontSize: "0.65rem",
                  fontWeight: "700",
                  color: "#191918",
                  marginBottom: "0.3rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}>
                  Date/Time
                </label>
                <input
                  type="datetime-local"
                  value={newRunMetadata.dateTime}
                  onChange={(e) => setNewRunMetadata({ ...newRunMetadata, dateTime: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.45rem",
                    border: "1px solid #c0c0b8",
                    borderRadius: "0",
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    background: "#fafaf8"
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: "block",
                  fontSize: "0.65rem",
                  fontWeight: "700",
                  color: "#191918",
                  marginBottom: "0.3rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
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
                    padding: "0.45rem",
                    border: "1px solid #c0c0b8",
                    borderRadius: "0",
                    fontSize: "0.75rem",
                    resize: "vertical",
                    fontFamily: "monospace",
                    background: "#fafaf8"
                  }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleAddRun}
            disabled={uploading || !csvFile || !jsonFile}
            className="add-run-btn"
          >
            {uploading ? "[...] Adding..." : "[→] Add Run"}
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
                    padding: "0.75rem 1rem",
                    background: "#fafaf8",
                    borderBottom: "2px solid #191918",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <label style={{
                    fontWeight: 700,
                    fontSize: "0.65rem",
                    color: "#191918",
                    textTransform: "uppercase",
                    letterSpacing: "0.8px"
                  }}>
                    CPU Type:
                  </label>
                  <div style={{ display: "flex", gap: "0.35rem" }}>
                    {["total", "kernel", "user"].map((type) => (
                      <button
                        key={type}
                        onClick={() => setPdCpuType(type)}
                        style={{
                          padding: "0.35rem 0.75rem",
                          borderRadius: "0",
                          border: "1px solid #c0c0b8",
                          fontSize: "0.7rem",
                          fontWeight: "700",
                          backgroundColor: pdCpuType === type ? "#191918" : "#ffffff",
                          color: pdCpuType === type ? "#f4f4f2" : "#191918",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          boxShadow: pdCpuType === type ? "2px 2px 0 rgba(25, 25, 24, 0.15)" : "none"
                        }}
                        onMouseEnter={(e) => {
                          if (pdCpuType !== type) {
                            e.currentTarget.style.background = "#f4f4f2";
                            e.currentTarget.style.borderColor = "#191918";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (pdCpuType !== type) {
                            e.currentTarget.style.background = "#ffffff";
                            e.currentTarget.style.borderColor = "#c0c0b8";
                          }
                        }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
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
                    title: { text: "CPU Utilisation (%)", font: { size: 16 } },
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

                        const currentPlotType = customPlotPdTypes[customPlot.id] || "bar";

                        customPlotData.push(currentPlotType === "bar" ? {
                          x: run.cpuData.tests.map((test) => {
                            const val = test.throughput_mbps * 1e6;
                            if (val >= 1e9) return `${(val / 1e9).toFixed(1)}G`;
                            if (val >= 1e6) return `${(val / 1e6).toFixed(0)}M`;
                            if (val >= 1e3) return `${(val / 1e3).toFixed(0)}K`;
                            return val.toString();
                          }),
                          y: run.cpuData.tests.map(getCpuValue),
                          type: "bar",
                          name: `${run.name} (${pdName})`,
                          marker: {
                            color: usePDColors
                              ? colors[runIndex % colors.length]
                              : pdColors[pdIndex % pdColors.length],
                          },
                          hovertemplate:
                            `<b>${run.name} (${pdName})</b><br>` +
                            "Throughput: %{x}<br>" +
                            "CPU: %{y:.2f}%<br>" +
                            "<extra></extra>",
                        } : {
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
                    title: { text: "CPU Utilisation (%)", font: { size: 16 } },
                    rangemode: "tozero",
                    gridcolor: "#e0e0e0",
                    showgrid: true,
                  },
                  barmode: "group",
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
              } else if (customPlot.plotType === "cache") {
                // Cache metrics plot
                const selectedMetrics = customPlot.cacheMetrics || [];
                const currentPlotType = customPlotPdTypes[customPlot.id] || "bar";

                selectedMetrics.forEach((metricName, metricIndex) => {
                  selectedRunsData.forEach((run, runIndex) => {
                    if (run.cpuData?.pmu_data?.[metricName]) {
                      const metricData = run.cpuData.pmu_data[metricName];
                      const throughputs = run.cpuData.metadata?.test_throughputs || [];

                      customPlotData.push(currentPlotType === "bar" ? {
                        x: throughputs.map(val => `${val}M`),
                        y: metricData,
                        type: "bar",
                        name: `${run.name} - ${metricName}`,
                        marker: {
                          color: colors[runIndex % colors.length],
                        },
                        hovertemplate:
                          `<b>${run.name}</b><br>` +
                          `${metricName}: %{y:,.0f}<br>` +
                          "Throughput: %{x}<br>" +
                          "<extra></extra>",
                      } : {
                        x: throughputs.map(val => `${val}M`),
                        y: metricData,
                        type: "scatter",
                        mode: "lines+markers",
                        name: `${run.name} - ${metricName}`,
                        line: {
                          color: colors[runIndex % colors.length],
                          width: 2,
                          dash: metricIndex === 0 ? "solid" : metricIndex === 1 ? "dash" : "dot",
                        },
                        marker: {
                          size: 6,
                          color: colors[runIndex % colors.length],
                        },
                        hovertemplate:
                          `<b>${run.name}</b><br>` +
                          `${metricName}: %{y:,.0f}<br>` +
                          "Throughput: %{x}<br>" +
                          "<extra></extra>",
                      });
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
                      text: "Throughput (Mbps)",
                      font: { size: 16 },
                    },
                    gridcolor: "#e0e0e0",
                    showgrid: true,
                  },
                  yaxis: {
                    title: {
                      text: "Count",
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
                  ...(currentPlotType === "bar" && { barmode: "group" }),
                  margin: { l: 80, r: 200, t: 80, b: 80 },
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

              // Calculate statistics for cache plots
              const calculateCacheStats = () => {
                if (customPlot.plotType !== "cache" || selectedRunsData.length < 2) return null;

                const baselineRun = selectedRunsData[0];
                const stats = [];

                customPlot.cacheMetrics.forEach(metricName => {
                  const metricStats = { metricName, comparisons: [] };

                  const baselineData = baselineRun.cpuData?.pmu_data?.[metricName] || [];

                  // Compare each other run
                  for (let i = 1; i < selectedRunsData.length; i++) {
                    const compareRun = selectedRunsData[i];
                    const compareData = compareRun.cpuData?.pmu_data?.[metricName] || [];

                    if (baselineData.length > 0 && compareData.length > 0) {
                      const minLength = Math.min(baselineData.length, compareData.length);
                      const relDiffs = [];
                      const absDiffs = [];

                      // Calculate point-by-point differences
                      for (let j = 0; j < minLength; j++) {
                        const baseline = baselineData[j];
                        const compare = compareData[j];

                        if (baseline > 0) {
                          relDiffs.push(((compare - baseline) / baseline) * 100);
                        }
                        absDiffs.push(compare - baseline);
                      }

                      // Calculate averages for display
                      const baselineAvg = baselineData.reduce((a, b) => a + b, 0) / baselineData.length;
                      const compareAvg = compareData.reduce((a, b) => a + b, 0) / compareData.length;

                      // Mean of point-by-point relative differences
                      const meanRelDiff = relDiffs.length > 0 ? relDiffs.reduce((a, b) => a + b, 0) / relDiffs.length : 0;
                      const meanAbsDiff = absDiffs.length > 0 ? absDiffs.reduce((a, b) => a + b, 0) / absDiffs.length : 0;

                      metricStats.comparisons.push({
                        runName: compareRun.name,
                        baselineName: baselineRun.name,
                        baselineAvg,
                        compareAvg,
                        relDiff: meanRelDiff,
                        absDiff: meanAbsDiff
                      });
                    }
                  }

                  if (metricStats.comparisons.length > 0) {
                    stats.push(metricStats);
                  }
                });

                return stats.length > 0 ? stats : null;
              };

              const cacheStats = calculateCacheStats();

              return (
                <div key={customPlot.id}>
                  {(customPlot.plotType === "pds" || customPlot.plotType === "cache") && (
                    <div
                      style={{
                        padding: "0.75rem 1rem",
                        background: "#fafaf8",
                        borderBottom: "2px solid #191918",
                        display: "flex",
                        alignItems: "center",
                        gap: "1.5rem",
                      }}
                    >
                      {customPlot.plotType === "pds" && (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <label style={{
                              fontWeight: 700,
                              fontSize: "0.65rem",
                              color: "#191918",
                              textTransform: "uppercase",
                              letterSpacing: "0.8px"
                            }}>
                              CPU Type:
                            </label>
                            <div style={{ display: "flex", gap: "0.35rem" }}>
                              {["total", "kernel", "user"].map((type) => {
                                const currentType = customPlotCpuTypes[customPlot.id] || customPlot.cpuType || "total";
                                return (
                                  <button
                                    key={type}
                                    onClick={() =>
                                      setCustomPlotCpuTypes({
                                        ...customPlotCpuTypes,
                                        [customPlot.id]: type,
                                      })
                                    }
                                    style={{
                                      padding: "0.35rem 0.75rem",
                                      borderRadius: "0",
                                      border: "1px solid #c0c0b8",
                                      fontSize: "0.7rem",
                                      fontWeight: "700",
                                      backgroundColor: currentType === type ? "#191918" : "#ffffff",
                                      color: currentType === type ? "#f4f4f2" : "#191918",
                                      cursor: "pointer",
                                      transition: "all 0.15s",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.5px",
                                      boxShadow: currentType === type ? "2px 2px 0 rgba(25, 25, 24, 0.15)" : "none"
                                    }}
                                    onMouseEnter={(e) => {
                                      if (currentType !== type) {
                                        e.currentTarget.style.background = "#f4f4f2";
                                        e.currentTarget.style.borderColor = "#191918";
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (currentType !== type) {
                                        e.currentTarget.style.background = "#ffffff";
                                        e.currentTarget.style.borderColor = "#c0c0b8";
                                      }
                                    }}
                                  >
                                    {type}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}

                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <label style={{
                          fontWeight: 700,
                          fontSize: "0.65rem",
                          color: "#191918",
                          textTransform: "uppercase",
                          letterSpacing: "0.8px"
                        }}>
                          Plot Type:
                        </label>
                        <div style={{ display: "flex", gap: "0.35rem" }}>
                          {["bar", "line"].map((type) => {
                            const currentPlotType = customPlotPdTypes[customPlot.id] || "bar";
                            return (
                              <button
                                key={type}
                                onClick={() =>
                                  setCustomPlotPdTypes({
                                    ...customPlotPdTypes,
                                    [customPlot.id]: type,
                                  })
                                }
                                style={{
                                  padding: "0.35rem 0.75rem",
                                  borderRadius: "0",
                                  border: "1px solid #c0c0b8",
                                  fontSize: "0.7rem",
                                  fontWeight: "700",
                                  backgroundColor: currentPlotType === type ? "#191918" : "#ffffff",
                                  color: currentPlotType === type ? "#f4f4f2" : "#191918",
                                  cursor: "pointer",
                                  transition: "all 0.15s",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  boxShadow: currentPlotType === type ? "2px 2px 0 rgba(25, 25, 24, 0.15)" : "none"
                                }}
                                onMouseEnter={(e) => {
                                  if (currentPlotType !== type) {
                                    e.currentTarget.style.background = "#f4f4f2";
                                    e.currentTarget.style.borderColor = "#191918";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (currentPlotType !== type) {
                                    e.currentTarget.style.background = "#ffffff";
                                    e.currentTarget.style.borderColor = "#c0c0b8";
                                  }
                                }}
                              >
                                {type}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="chart-section" style={{ height: (pdStats || cacheStats) ? "calc(100vh - 320px)" : "calc(100vh - 220px)", minHeight: "500px" }}>
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
                      padding: "1rem 1.5rem",
                      background: "#fafaf8",
                      borderTop: "2px solid #191918",
                      fontSize: "0.75rem",
                      maxHeight: "200px",
                      overflowY: "auto"
                    }}>
                      <div style={{
                        fontWeight: "700",
                        marginBottom: "0.75rem",
                        color: "#191918",
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.8px"
                      }}>
                        Relative Overhead vs Baseline ({customPlotCpuTypes[customPlot.id] || customPlot.cpuType || "total"} CPU)
                      </div>

                      {/* Formula Display */}
                      <div style={{
                        background: "#ffffff",
                        border: "2px solid #191918",
                        padding: "0.75rem",
                        marginBottom: "1rem",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                        lineHeight: "1.5"
                      }}>
                        <div style={{ color: "#6b6b68", marginBottom: "0.4rem", fontWeight: "700", letterSpacing: "0.5px" }}>
                          CALCULATION:
                        </div>
                        <div style={{ color: "#191918" }}>
                          <div>For each data point i:</div>
                          <div style={{ marginLeft: "1rem", marginTop: "0.2rem" }}>
                            RelDiff[i] = ((Compare[i] - Baseline[i]) / Baseline[i]) × 100
                          </div>
                          <div style={{ marginLeft: "1rem" }}>
                            AbsDiff[i] = Compare[i] - Baseline[i]
                          </div>
                          <div style={{ marginTop: "0.4rem" }}>
                            Result = Arithmetic Mean of differences
                          </div>
                        </div>
                      </div>

                      {pdStats.map(({ pdName, comparisons }) => (
                        <div key={pdName} style={{ marginBottom: "0.75rem" }}>
                          <div style={{
                            fontWeight: "700",
                            color: "#191918",
                            marginBottom: "0.35rem",
                            fontSize: "0.7rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px"
                          }}>
                            [{pdName}]
                          </div>
                          {comparisons.map((comp, idx) => (
                            <div key={idx} style={{
                              marginLeft: "1rem",
                              color: "#191918",
                              lineHeight: "1.7",
                              fontFamily: "monospace",
                              fontSize: "0.7rem"
                            }}>
                              {comp.runName} vs {comp.baselineName}: <span style={{ fontWeight: "700", color: comp.meanRel >= 0 ? "#8b0000" : "#006400" }}>{comp.meanRel >= 0 ? '+' : ''}{comp.meanRel.toFixed(1)}%</span> ({comp.meanAbs >= 0 ? '+' : ''}{comp.meanAbs.toFixed(2)}pp)
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {cacheStats && (
                    <div style={{
                      padding: "1rem 1.5rem",
                      background: "#fafaf8",
                      borderTop: "2px solid #191918",
                      fontSize: "0.75rem",
                      maxHeight: "200px",
                      overflowY: "auto"
                    }}>
                      <div style={{
                        fontWeight: "700",
                        marginBottom: "0.75rem",
                        color: "#191918",
                        fontSize: "0.7rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.8px"
                      }}>
                        Cache Metrics Comparison vs Baseline
                      </div>

                      {/* Formula Display */}
                      <div style={{
                        background: "#ffffff",
                        border: "2px solid #191918",
                        padding: "0.75rem",
                        marginBottom: "1rem",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                        lineHeight: "1.5"
                      }}>
                        <div style={{ color: "#6b6b68", marginBottom: "0.4rem", fontWeight: "700", letterSpacing: "0.5px" }}>
                          CALCULATION:
                        </div>
                        <div style={{ color: "#191918" }}>
                          <div>For each data point i:</div>
                          <div style={{ marginLeft: "1rem", marginTop: "0.2rem" }}>
                            RelDiff[i] = ((Compare[i] - Baseline[i]) / Baseline[i]) × 100
                          </div>
                          <div style={{ marginLeft: "1rem" }}>
                            AbsDiff[i] = Compare[i] - Baseline[i]
                          </div>
                          <div style={{ marginTop: "0.4rem" }}>
                            Result = Arithmetic Mean of differences
                          </div>
                        </div>
                      </div>

                      {cacheStats.map(({ metricName, comparisons }) => (
                        <div key={metricName} style={{ marginBottom: "0.75rem" }}>
                          <div style={{
                            fontWeight: "700",
                            color: "#191918",
                            marginBottom: "0.35rem",
                            fontSize: "0.7rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px"
                          }}>
                            [{metricName}]
                          </div>
                          {comparisons.map((comp, idx) => (
                            <div key={idx} style={{
                              marginLeft: "1rem",
                              color: "#191918",
                              lineHeight: "1.7",
                              fontFamily: "monospace",
                              fontSize: "0.7rem"
                            }}>
                              {comp.runName} vs {comp.baselineName}: <span style={{ fontWeight: "700", color: comp.relDiff >= 0 ? "#8b0000" : "#006400" }}>{comp.relDiff >= 0 ? '+' : ''}{comp.relDiff.toFixed(1)}%</span>
                              <div style={{ fontSize: "0.65rem", color: "#6b6b68", marginTop: "0.2rem" }}>
                                Baseline: {comp.baselineAvg.toLocaleString('en-AU', {maximumFractionDigits: 0})} | Compare: {comp.compareAvg.toLocaleString('en-AU', {maximumFractionDigits: 0})}
                              </div>
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
                <option value="cache">Cache Metrics</option>
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

            {newPlot.plotType === "cache" &&
              (() => {
                // Get available cache metrics from first run with PMU data
                const cacheMetrics = ["L1 i-cache misses", "L1 d-cache misses", "L1 i-tlb misses", "L1 d-tlb misses", "Instructions", "Branch mispredictions"];
                const hasPMUData = runs.some((run) => run.cpuData?.pmu_data);

                return hasPMUData ? (
                  <div className="dialog-field">
                    <label>Select Cache Metrics:</label>
                    <div className="checkbox-list">
                      {cacheMetrics.map((metricName) => (
                        <label key={metricName} className="checkbox-item">
                          <input
                            type="checkbox"
                            checked={newPlot.cacheMetrics.includes(metricName)}
                            onChange={() => toggleCacheMetricSelection(metricName)}
                          />
                          {metricName}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="dialog-field">
                    <p style={{ color: "#999", fontSize: "0.9rem" }}>
                      No cache/PMU data available. Upload runs with PMU data to enable this option.
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

      {/* Rename Session Dialog */}
      {showRenameDialog && (
        <div
          className="dialog-overlay"
          onClick={() => setShowRenameDialog(false)}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h2>Rename Session</h2>
            <div className="dialog-field">
              <label>Session Name:</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter session name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameSession();
                  if (e.key === 'Escape') setShowRenameDialog(false);
                }}
              />
            </div>
            <div className="dialog-actions">
              <button
                onClick={() => setShowRenameDialog(false)}
                className="btn-cancel"
              >
                Cancel
              </button>
              <button onClick={renameSession} className="btn-create">
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
