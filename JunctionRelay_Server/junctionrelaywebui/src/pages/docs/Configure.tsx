/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * JunctionRelay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with JunctionRelay. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * Which documentation sites appear as tabs.
 *
 * ⛔ This page cannot widen what the server may read. LAB_DOCS_ROOTS is the security
 * boundary and is set where the container runs; everything here only chooses among
 * folders already inside it. The server re-checks on save regardless.
 *
 * Layout is style-guide pattern 2 - config panel above a data table: standalone h6
 * title, each panel its own accordion, table controls in the accordion header.
 */

import { useEffect, useState } from "react";
import {
    Box, Typography, Accordion, AccordionSummary, AccordionDetails,
    Table, TableBody, TableCell, TableHead, TableRow, TextField, Button,
    IconButton, Alert, AlertTitle, Chip, MenuItem, Select, Snackbar, CircularProgress
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import SaveIcon from "@mui/icons-material/Save";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
    TABLE_HEADER_ROW_SX, TABLE_CELL_SX, TABLE_HEADER_CELL_SX,
    ACCORDION_SUMMARY_SX, ACCORDION_HEADER_BOX_SX, ACCORDION_CONTROLS_SX
} from "@junctionrelay/styles";
import { useDocsSites } from "./useDocsSites";
import { errorMessage } from '../../utils/errors';

interface Candidate { path: string; name: string; }
interface Row { name: string; path: string; }

const DocsConfigure = () => {
    const { data, loading, reload } = useDocsSites();
    const [rows, setRows] = useState<Row[]>([]);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [newPath, setNewPath] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (data) setRows(data.sites.map(s => ({ name: s.name, path: s.path })));
    }, [data]);

    useEffect(() => {
        fetch("/api/docs/candidates")
            .then(r => (r.ok ? r.json() : []))
            .then(setCandidates)
            .catch(() => setCandidates([]));
    }, []);

    const addRow = () => {
        const c = candidates.find(x => x.path === newPath);
        if (!c || rows.some(r => r.path === c.path)) return;
        setRows([...rows, { name: c.name, path: c.path }]);
        setNewPath("");
    };

    const put = async (body: Row[]) => {
        setError(null);
        try {
            const res = await fetch("/api/docs/sites", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
            setSaved(true);
            await reload();
        } catch (e) {
            setError(errorMessage(e) ?? "Save failed.");
        }
    };

    const unused = candidates.filter(c => !rows.some(r => r.path === c.path));
    const autoDetected = !!data?.sites.some(s => s.discovered);

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Configure documentation</Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    <AlertTitle>Save failed</AlertTitle>{error}
                </Alert>
            )}

            {/* Config / info accordion — icon + title, no right-side controls */}
            <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, width: "100%" }}>
                        <MenuBookIcon color="primary" />
                        <Typography variant="h6" sx={{ fontSize: "1rem" }}>Source</Typography>
                        {loading && <CircularProgress size={16} />}
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 2 }}>
                        <Chip
                            size="small"
                            label={data?.enabled ? "Enabled" : "Disabled"}
                            color={data?.enabled ? "success" : "default"}
                        />
                        {data?.roots.map(r => (
                            <Chip key={r} size="small" variant="outlined" label={r} />
                        ))}
                    </Box>

                    {!data?.enabled ? (
                        <Alert severity="info">
                            <AlertTitle>Nothing can be served yet</AlertTitle>
                            <code>{data?.rootsVar ?? "LAB_DOCS_ROOTS"}</code> is not set. Map a host folder
                            of built documentation into the container and set that variable to the
                            container path. That is set where the container runs, not here — the web UI
                            deliberately cannot widen what the server may read.
                        </Alert>
                    ) : autoDetected ? (
                        <Alert severity="info">
                            Nothing is configured, so every built site found under the roots is shown. Add
                            one below to take control of the list — useful when you want to{" "}
                            <strong>exclude</strong> something rather than include it.
                        </Alert>
                    ) : (
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            Only folders containing an <code>index.html</code> are offered — that is what a
                            built MkDocs site looks like. A repository on its source branch has markdown,
                            not HTML, and will not appear.
                        </Typography>
                    )}
                </AccordionDetails>
            </Accordion>

            {/* Data table accordion — title with count, controls on the right */}
            <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={ACCORDION_SUMMARY_SX}>
                    <Box sx={ACCORDION_HEADER_BOX_SX}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            Sites ({loading ? "..." : rows.length})
                        </Typography>
                        <Box sx={ACCORDION_CONTROLS_SX} onClick={e => e.stopPropagation()}>
                            <Select
                                size="small"
                                displayEmpty
                                value={newPath}
                                onChange={e => setNewPath(e.target.value)}
                                sx={{ minWidth: 260 }}
                                disabled={unused.length === 0}
                            >
                                <MenuItem value="">
                                    {unused.length ? "Choose a built site…" : "No unused sites found"}
                                </MenuItem>
                                {unused.map(c => (
                                    <MenuItem key={c.path} value={c.path}>{c.name} — {c.path}</MenuItem>
                                ))}
                            </Select>
                            <Button size="small" variant="contained" startIcon={<AddIcon />}
                                    onClick={addRow} disabled={!newPath}>
                                Add
                            </Button>
                            <Button size="small" variant="outlined" startIcon={<RestartAltIcon />}
                                    onClick={() => { setRows([]); put([]); }}>
                                Reset to auto-detected
                            </Button>
                            <Button size="small" variant="outlined" startIcon={<SaveIcon />}
                                    onClick={() => put(rows)} disabled={loading}>
                                Save
                            </Button>
                        </Box>
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={TABLE_HEADER_ROW_SX}>
                                <TableCell sx={TABLE_HEADER_CELL_SX}>Tab name</TableCell>
                                <TableCell sx={TABLE_HEADER_CELL_SX}>Path in container</TableCell>
                                <TableCell sx={TABLE_HEADER_CELL_SX} align="right">Remove</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.length === 0 && (
                                <TableRow>
                                    <TableCell sx={TABLE_CELL_SX} colSpan={3}>
                                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                            Nothing configured.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                            {rows.map((r, i) => (
                                <TableRow key={r.path}>
                                    <TableCell sx={TABLE_CELL_SX}>
                                        <TextField
                                            size="small"
                                            value={r.name}
                                            onChange={e => setRows(rows.map((x, j) =>
                                                j === i ? { ...x, name: e.target.value } : x))}
                                        />
                                    </TableCell>
                                    <TableCell sx={TABLE_CELL_SX}>
                                        <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                                            {r.path}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={TABLE_CELL_SX} align="right">
                                        <IconButton size="small"
                                                    onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </AccordionDetails>
            </Accordion>

            <Snackbar
                open={saved}
                autoHideDuration={3000}
                onClose={() => setSaved(false)}
                message="Saved — the tab row updates on next navigation"
            />
        </Box>
    );
};

export default DocsConfigure;
