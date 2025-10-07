import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getExpandedRowModel,
  flexRender,
} from "@tanstack/react-table";
import { prepareTableData, formatters } from "../utils/tableData.js";

/**
 * RunDataTable Component
 *
 * Displays benchmark run data in a table format with expandable rows
 * showing protection domain breakdowns when CPU data is available.
 *
 * @param {Object} props - Component props
 * @param {Object} props.run - The run object containing data and cpuData
 * @param {Function} props.onClose - Callback function to close the table view
 * @returns {JSX.Element} The table component
 */
function RunDataTable({ run, onClose }) {
  const [expanded, setExpanded] = useState({});

  // Prepare table data from run object
  const data = useMemo(() => prepareTableData(run), [run]);

  // Define table columns
  const columns = useMemo(
    () => [
      {
        id: "expander",
        header: "",
        cell: ({ row }) => {
          // Only show expander if row has protection domain data
          if (!row.original.protectionDomains) {
            return null;
          }
          return (
            <button
              onClick={row.getToggleExpandedHandler()}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "1rem",
                padding: "0.25rem 0.5rem",
                color: "#555",
                transition: "transform 0.2s",
                transform: row.getIsExpanded() ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              ▶
            </button>
          );
        },
        size: 40,
      },
      {
        accessorKey: "testNumber",
        header: "Test #",
        size: 80,
      },
      {
        accessorKey: "requestedThroughput",
        header: "Requested Throughput",
        cell: ({ getValue }) => formatters.throughput(getValue()),
        size: 180,
      },
      {
        accessorKey: "receivedThroughput",
        header: "Received Throughput",
        cell: ({ getValue }) => formatters.throughput(getValue()),
        size: 180,
      },
      {
        accessorKey: "throughputPercent",
        header: "Throughput %",
        cell: ({ getValue }) => {
          const value = getValue();
          return (
            <span
              style={{
                color: value >= 95 ? "#28a745" : value >= 80 ? "#ffc107" : "#dc3545",
                fontWeight: "600",
              }}
            >
              {formatters.percentage(value)}
            </span>
          );
        },
        size: 120,
      },
      {
        accessorKey: "avgRTT",
        header: "Avg RTT",
        cell: ({ getValue }) => {
          const value = getValue();
          return value !== null ? formatters.microseconds(value) : "-";
        },
        size: 120,
      },
      {
        accessorKey: "totalCPU",
        header: "CPU %",
        cell: ({ getValue }) => {
          const value = getValue();
          return value !== null ? formatters.percentage(value) : "-";
        },
        size: 100,
      },
    ],
    []
  );

  // Initialize table
  const table = useReactTable({
    data,
    columns,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: (row) => !!row.original.protectionDomains,
  });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "2rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
          maxWidth: "1200px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #e0e0e0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#f8f9fa",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.5rem", color: "#333" }}>
              {run.name}
            </h2>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: "#666" }}>
              {data.length} test{data.length !== 1 ? "s" : ""}
              {run.cpuData ? " with CPU data" : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              onClick={() => {
                // Export table data as CSV
                const headers = [
                  "Test #",
                  "Requested Throughput (bps)",
                  "Received Throughput (bps)",
                  "Throughput %",
                  "Avg RTT (μs)",
                  "Min RTT (μs)",
                  "Max RTT (μs)",
                  "Stdev RTT (μs)",
                  "Median RTT (μs)",
                  "Bad Packets",
                  "Total CPU %",
                  "Kernel CPU %",
                  "User CPU %"
                ];

                const rows = data.map(row => [
                  row.testNumber,
                  row.requestedThroughput,
                  row.receivedThroughput,
                  row.throughputPercent,
                  row.avgRTT,
                  row.minRTT,
                  row.maxRTT,
                  row.stdevRTT,
                  row.medianRTT,
                  row.badPackets,
                  row.totalCPU ?? "N/A",
                  row.kernelCPU ?? "N/A",
                  row.userCPU ?? "N/A"
                ]);

                const csvContent = [
                  headers.join(","),
                  ...rows.map(row => row.join(","))
                ].join("\n");

                const blob = new Blob([csvContent], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${run.name.replace(/[^a-z0-9]/gi, "_")}_data.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                padding: "0.5rem 1rem",
                background: "#191918",
                color: "#f4f4f2",
                border: "none",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontWeight: "500",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#2a2a28"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#191918"}
            >
              Export CSV
            </button>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "2rem",
              cursor: "pointer",
              color: "#666",
              padding: "0",
              width: "2rem",
              height: "2rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              transition: "background-color 0.2s",
            }}
            onMouseEnter={(e) => (e.target.style.backgroundColor = "#e0e0e0")}
            onMouseLeave={(e) => (e.target.style.backgroundColor = "transparent")}
          >
            ×
          </button>
          </div>
        </div>

        {/* Table Container */}
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "1rem",
          }}
        >
          {data.length === 0 ? (
            <div
              style={{
                padding: "3rem",
                textAlign: "center",
                color: "#999",
              }}
            >
              <p>No data available for this run.</p>
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
              }}
            >
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        style={{
                          padding: "0.75rem 1rem",
                          textAlign: "left",
                          borderBottom: "2px solid #e0e0e0",
                          backgroundColor: "#f8f9fa",
                          fontWeight: "600",
                          color: "#555",
                          position: "sticky",
                          top: 0,
                          zIndex: 10,
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <React.Fragment key={row.id}>
                    {/* Main row */}
                    <tr
                      style={{
                        backgroundColor: row.getIsExpanded() ? "#f0f7ff" : "white",
                        transition: "background-color 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        if (!row.getIsExpanded()) {
                          e.currentTarget.style.backgroundColor = "#f8f9fa";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!row.getIsExpanded()) {
                          e.currentTarget.style.backgroundColor = "white";
                        }
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={{
                            padding: "0.75rem 1rem",
                            borderBottom: "1px solid #e0e0e0",
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>

                    {/* Expanded protection domain rows */}
                    {row.getIsExpanded() && row.original.protectionDomains && (
                      <tr key={`${row.id}-expanded`}>
                        <td
                          colSpan={columns.length}
                          style={{
                            padding: 0,
                            backgroundColor: "#f8f9fa",
                            borderBottom: "1px solid #e0e0e0",
                          }}
                        >
                          <div
                            style={{
                              padding: "1rem 2rem",
                              margin: "0.5rem 0",
                            }}
                          >
                            <h4
                              style={{
                                margin: "0 0 0.75rem 0",
                                fontSize: "0.875rem",
                                color: "#666",
                                fontWeight: "600",
                              }}
                            >
                              Protection Domain Breakdown
                            </h4>
                            <table
                              style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: "0.85rem",
                              }}
                            >
                              <thead>
                                <tr>
                                  <th
                                    style={{
                                      padding: "0.5rem",
                                      textAlign: "left",
                                      borderBottom: "1px solid #d0d0d0",
                                      backgroundColor: "white",
                                      fontWeight: "600",
                                      color: "#555",
                                    }}
                                  >
                                    Protection Domain
                                  </th>
                                  <th
                                    style={{
                                      padding: "0.5rem",
                                      textAlign: "left",
                                      borderBottom: "1px solid #d0d0d0",
                                      backgroundColor: "white",
                                      fontWeight: "600",
                                      color: "#555",
                                    }}
                                  >
                                    Total CPU %
                                  </th>
                                  <th
                                    style={{
                                      padding: "0.5rem",
                                      textAlign: "left",
                                      borderBottom: "1px solid #d0d0d0",
                                      backgroundColor: "white",
                                      fontWeight: "600",
                                      color: "#555",
                                    }}
                                  >
                                    Kernel CPU %
                                  </th>
                                  <th
                                    style={{
                                      padding: "0.5rem",
                                      textAlign: "left",
                                      borderBottom: "1px solid #d0d0d0",
                                      backgroundColor: "white",
                                      fontWeight: "600",
                                      color: "#555",
                                    }}
                                  >
                                    User CPU %
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.original.protectionDomains.map((pd, pdIndex) => (
                                  <tr
                                    key={`${row.id}-pd-${pd.name}`}
                                    style={{
                                      backgroundColor: pdIndex % 2 === 0 ? "white" : "#fafafa",
                                    }}
                                  >
                                    <td
                                      style={{
                                        padding: "0.5rem",
                                        borderBottom: "1px solid #e8e8e8",
                                        fontWeight: "500",
                                      }}
                                    >
                                      {pd.name}
                                    </td>
                                    <td
                                      style={{
                                        padding: "0.5rem",
                                        borderBottom: "1px solid #e8e8e8",
                                      }}
                                    >
                                      {formatters.percentage(pd.cpuUtilization)}
                                    </td>
                                    <td
                                      style={{
                                        padding: "0.5rem",
                                        borderBottom: "1px solid #e8e8e8",
                                      }}
                                    >
                                      {formatters.percentage(pd.kernelCpuUtilization)}
                                    </td>
                                    <td
                                      style={{
                                        padding: "0.5rem",
                                        borderBottom: "1px solid #e8e8e8",
                                      }}
                                    >
                                      {formatters.percentage(pd.userCpuUtilization)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default RunDataTable;
