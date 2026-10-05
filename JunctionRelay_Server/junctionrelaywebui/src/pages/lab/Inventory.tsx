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

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { fuzzyTerms, fuzzyMatch } from "../../components/Lab_Fuzzy";
import { useNavigate } from "react-router-dom";
import {
    Typography,
    Box,
    Button,
    IconButton,
    CircularProgress,
    LinearProgress,
    Snackbar,
    Alert,
    Chip,
    Tooltip,
    Switch,
    TextField,
    InputAdornment,
    ToggleButton,
    ToggleButtonGroup,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Tabs,
    Tab,
    useTheme,
    useMediaQuery,
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import CategoryIcon from '@mui/icons-material/Category';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import DnsIcon from '@mui/icons-material/Dns';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DeleteIcon from '@mui/icons-material/Delete';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import CheckIcon from '@mui/icons-material/Check';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import HeartBrokenIcon from '@mui/icons-material/HeartBroken';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import LinkIcon from '@mui/icons-material/Link';
import { Badge } from '@mui/material';
import LabComponentAttachmentsDialog from '../../components/Lab_Component_AttachmentsDialog';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useComponentTypes } from '../../components/Lab_ComponentTypes_Client';
import LabComponentTypesDialog from '../../components/Lab_ComponentTypes_Dialog';
import { useColumnVisibility, ColumnPickerPopover, type ColumnDefinition } from '@junctionrelay/styles';
import LabComponentAddModal from '../../components/Lab_Component_AddModal';
import LabComponentMoveDialog from '../../components/Lab_Component_MoveDialog';
import {
    type LabComponentFull,
    type SectionColumn,
    INVENTORY_COLUMNS,
    COMPONENT_TYPE_EMOJI,
    getComponentStatusInfo,
    isRetiredStatus,
    componentDisplayName,
    componentReleased,
    basisPrice,
    basisDate,
    basisIsMsrpFallback,
    isIntegratedChild,
    type PriceBasis,
    parseSpecJson,
} from '../../components/Lab_Inventory_Helpers';
import {
    ColumnFilterButton, distinctValues, passesFilters, activeFilterCount,
    type ColumnFilters,
} from '../../components/Lab_Column_Filter';
import { getPriceColorMode, refreshPriceColorMode, vsPaidColor } from '../../components/Lab_Display_Settings';
import LabPriceColorsToggle from '../../components/Lab_PriceColors_Toggle';
import { type LabMachine } from '../../components/Lab_Machines_Helpers';
import { errorMessage } from '../../utils/errors';

type SortDirection = 'asc' | 'desc';

const STORAGE_KEY_INVENTORY_COLUMNS = "lab_inventory_visible_columns";
const STORAGE_KEY_INVENTORY_SORT = "lab_inventory_sort_state";
const STORAGE_KEY_INVENTORY_ALL_EXPANDED = "lab_inventory_all_expanded";
const STORAGE_KEY_INVENTORY_SHELF_FILTER = "lab_inventory_shelf_filter";
const STORAGE_KEY_INVENTORY_ALL_FILTERS = "lab_inventory_all_filters";
const STORAGE_KEY_INVENTORY_SECTION_PREFIX = "lab_inventory_section_expanded_";
const STORAGE_KEY_INVENTORY_RECENT_WINDOW = "lab_inventory_recent_window";

// Recently Added: how far back "recent" reaches. The presets are day counts; 'custom' is
// a from/to pair. Persisted like the price basis - it is a lens, not a question.
type RecentWindow = '7' | '30' | '90' | 'custom';
const RECENT_PRESETS: { value: RecentWindow, label: string }[] = [
    { value: '7', label: '7d' },
    { value: '30', label: '30d' },
    { value: '90', label: '90d' },
    { value: 'custom', label: 'Custom' },
];

interface ComponentActions {
    onMove: (c: LabComponentFull) => void;
    onDelete: (c: LabComponentFull) => void;
    onAttachments: (c: LabComponentFull) => void;
}

// Indicator + entry point for attachments: muted clip when none, badged when present.
// An integrated part has no files of its own but is not undocumented - its invoice sits
// on the part it came inside, so the clip counts those and says whose they are.
const AttachmentsCell = ({ component, actions }: { component: LabComponentFull, actions: ComponentActions }) => {
    const own = component.attachmentCount || 0;
    const inherited = component.inheritedAttachmentCount || 0;
    const showing = own > 0 ? own : inherited;
    const fromParent = own === 0 && inherited > 0;

    return (
        <Tooltip title={
            fromParent
                ? `${inherited} file${inherited === 1 ? '' : 's'} on ${component.invoiceSourceName || 'the parent part'} — the purchase this came in`
                : own > 0
                    ? `${own} attachment${own === 1 ? '' : 's'}`
                    : 'Attach invoice / files'
        }>
            <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); actions.onAttachments(component); }}
                sx={{ color: own > 0 ? 'primary.main' : fromParent ? 'text.disabled' : 'action.disabled' }}
            >
                <Badge
                    badgeContent={showing}
                    color={fromParent ? 'default' : 'primary'}
                    overlap="circular"
                    invisible={!showing}
                >
                    <AttachFileIcon fontSize="small" />
                </Badge>
            </IconButton>
        </Tooltip>
    );
};

const ActionButtons = ({ component, actions }: { component: LabComponentFull, actions: ComponentActions }) => (
    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
        <Tooltip title="Move or place (machine, rack or shelf)">
            <span>
                <IconButton
                    size="small" color="info"
                    disabled={isRetiredStatus(component.status)}
                    onClick={(e) => { e.stopPropagation(); actions.onMove(component); }}
                >
                    <SwapHorizIcon fontSize="small" />
                </IconButton>
            </span>
        </Tooltip>
        <Tooltip title="Delete component">
            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); actions.onDelete(component); }}>
                <DeleteIcon fontSize="small" />
            </IconButton>
        </Tooltip>
    </Box>
);

const StatusChip = ({ status }: { status: string }) => {
    const info = getComponentStatusInfo(status);
    return <Chip label={info.label} color={info.color} size="small" variant="outlined" />;
};

// Basis vs paid — colored by the Homelab price-color lens (Dashboard → Display).
const deltaDisplay = (delta: number) => {
    const color = vsPaidColor(delta, getPriceColorMode());
    if (color === null) {
        return <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{Math.abs(delta) < 0.005 ? '$0.00' : `${delta > 0 ? '+' : '−'}$${Math.abs(delta).toFixed(2)}`}</Typography>;
    }
    return (
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontWeight: 600, color }}>
            {delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}
        </Typography>
    );
};

const DeltaCell = ({ component, basis }: { component: LabComponentFull, basis: PriceBasis }) => {
    const b = basisPrice(component, basis);
    if (b == null || component.purchasePrice == null) {
        return <Typography variant="caption" color="text.secondary">{'—'}</Typography>;
    }
    return deltaDisplay(b - component.purchasePrice);
};

// 🔑 A part can be in a machine AND in a rack at the same time - a GPU sits in the server, and
// the server sits in a rack - so these are separate answers, not alternatives, and each gets its
// own chip. A bare part racked on its own (a PDU, a patch panel) has a space and no machine.
// ⚠️ The rack chip is OUTLINED when inherited from the machine and FILLED when the part is
// placed itself: "this thing is in that rack" and "the box holding it is" are different claims.
const LocationCell = ({ component }: { component: LabComponentFull }) => {
    const machine = component.currentMachineName;
    const ownSpace = component.spaceName;
    const viaMachine = !ownSpace ? component.machineSpaceName : null;

    if (!machine && !ownSpace && !viaMachine) {
        return <Chip label="Shelf" size="small" variant="outlined" icon={<Inventory2Icon sx={{ fontSize: 14 }} />} />;
    }

    return (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {machine && <Chip label={machine} size="small" icon={<DnsIcon sx={{ fontSize: 14 }} />} />}
            {ownSpace && (
                <Tooltip title={component.spacePositionU ? `Placed at U${component.spacePositionU}` : 'Placed in this space'}>
                    <Chip label={component.spacePositionU ? `${ownSpace} U${component.spacePositionU}` : ownSpace}
                        size="small" color="info" icon={<ViewModuleIcon sx={{ fontSize: 14 }} />} />
                </Tooltip>
            )}
            {viaMachine && (
                <Tooltip title={`${machine} is racked in ${viaMachine}`}>
                    <Chip label={viaMachine} size="small" variant="outlined"
                        icon={<ViewModuleIcon sx={{ fontSize: 14 }} />} />
                </Tooltip>
            )}
        </Box>
    );
};

// One PCPartPicker-style section: an accordion with a per-type spec column set
// and its own column picker (persisted per type).
const TypeSection = ({ type, title, specCols, items, actions, onAdd, bulkExpand, onExpandedChange, priceBasis, alwaysExpanded }: {
    type: string,
    title: string,
    specCols: SectionColumn[],
    items: LabComponentFull[],
    actions: ComponentActions,
    onAdd: (type: string) => void,
    bulkExpand?: { value: boolean, seq: number },
    onExpandedChange?: (type: string, expanded: boolean) => void,
    priceBasis: PriceBasis,
    // Recently Added: every section open, no toggle, and NOTHING written to the
    // per-type expanded key - that key belongs to the Inventory tab's layout.
    alwaysExpanded?: boolean,
}) => {
    const navigate = useNavigate();
    const [expandedState, setExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem(STORAGE_KEY_INVENTORY_SECTION_PREFIX + type);
        return s !== null ? JSON.parse(s) : true;
    });
    const expanded = alwaysExpanded ? true : expandedState;
    useEffect(() => {
        if (alwaysExpanded) return;
        localStorage.setItem(STORAGE_KEY_INVENTORY_SECTION_PREFIX + type, JSON.stringify(expandedState));
        onExpandedChange?.(type, expandedState);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedState, type, alwaysExpanded]);

    // Bulk expand/collapse signal from the page header toggle
    useEffect(() => {
        if (bulkExpand && !alwaysExpanded) setExpanded(bulkExpand.value);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bulkExpand?.seq]);

    const [sort, setSort] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(`lab_inventory_${type.toLowerCase()}_sort`);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch {
            return { orderBy: 'name', order: 'asc' };
        }
    });
    useEffect(() => {
        localStorage.setItem(`lab_inventory_${type.toLowerCase()}_sort`, JSON.stringify(sort));
    }, [sort, type]);
    // Filters persist per section, same as the sort and the column choice - coming back
    // to a page you left filtered should show it the way you left it.
    const [filters, setFilters] = useState<ColumnFilters>(() => {
        try {
            const stored = localStorage.getItem(`lab_inventory_${type.toLowerCase()}_filters`);
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });
    useEffect(() => {
        localStorage.setItem(`lab_inventory_${type.toLowerCase()}_filters`, JSON.stringify(filters));
    }, [filters, type]);



    // Headers follow the toggle and name the answer, not the mechanism: what did it
    // list for when I bought it (and how much of a Discount did I get) vs what does it
    // go for New Today (and how much Value has what I paid Held). Each row carries its
    // own captured date, so no as-of date in the header.
    const basisLabel = priceBasis === 'today' ? 'New Today' : 'List @ Purchase';
    const deltaLabel = priceBasis === 'today' ? 'Value Held' : 'Discount';

    // Column definitions for the shared picker: fixed columns + this type's spec columns
    // 🔑 DEFAULT-VISIBLE = the columns every section shares, from Purchase Date to the
    // end. Everything before it - the per-type spec columns, status, location, released -
    // varies by category, which made each section a different shape out of the box, and a
    // fresh deployment (column layouts reset when the column set changes) opened on the
    // raggedest version of the page. The rule: the identical tail shows, the rest is
    // opt-in from the column picker, per section, persisted as before.
    const sectionColumnDefs = useMemo<ColumnDefinition<string>[]>(() => [
        { field: 'name', label: 'Component', align: 'left', sortable: true, alwaysVisible: true },
        ...specCols.map(sc => ({
            field: sc.key,
            label: sc.label,
            align: (sc.align ?? 'left') as 'left' | 'right',
            sortable: true,
            defaultHidden: true,
        })),
        { field: 'status', label: 'Status', align: 'left' as const, sortable: true, defaultHidden: true },
        { field: 'location', label: 'Location', align: 'left' as const, sortable: true, defaultHidden: true },
        { field: 'releaseYear', label: 'Released', align: 'right' as const, sortable: true, defaultHidden: true },
        { field: 'acquired', label: 'Purchase Date', align: 'right' as const, sortable: true },
        { field: 'vendor', label: 'Vendor', align: 'left' as const, sortable: true },
        { field: 'msrp', label: 'MSRP', align: 'right' as const, sortable: true },
        { field: 'basis', label: basisLabel, align: 'right' as const, sortable: true },
        { field: 'price', label: 'Paid', align: 'right' as const, sortable: true },
        { field: 'delta', label: deltaLabel, align: 'right' as const, sortable: true },
        { field: 'files', label: 'Files', align: 'right' as const, sortable: true },
        { field: 'actions', label: 'Actions', align: 'right' as const, pinned: 'end', alwaysVisible: true, width: 140 },
        // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [type, priceBasis]);

    const {
        visibleColumns, orderedColumns, hiddenColumns,
        toggleColumn, moveColumn, resetToDefault,
        anchorEl: colPickerAnchor, openPopover: openColPicker, closePopover: closeColPicker,
    // _v3: key bumped for the shared-tail default above - saved layouts from
    // v2 would otherwise keep every spec column visible and nobody would see the change.
    } = useColumnVisibility(`lab_inventory_${type.toLowerCase()}_columns_v3`, sectionColumnDefs);

    const sortValue = useCallback((c: LabComponentFull, orderBy: string): string | number => {
        if (orderBy === 'name') return componentDisplayName(c).toLowerCase();
        if (orderBy === 'status') return c.status;
        if (orderBy === 'location') return (c.currentMachineName || c.spaceName || c.machineSpaceName || '').toLowerCase();
        if (orderBy === 'msrp') return c.msrp ?? -1;
        if (orderBy === 'basis') return basisPrice(c, priceBasis) ?? -1;
        if (orderBy === 'price') return c.purchasePrice ?? -1;
        if (orderBy === 'delta') {
            const b = basisPrice(c, priceBasis);
            return (b != null && c.purchasePrice != null) ? b - c.purchasePrice : 0;
        }
        if (orderBy === 'files') return c.attachmentCount ?? 0;
        if (orderBy === 'releaseYear') return componentReleased(c) ?? '';
        if (orderBy === 'acquired') return c.acquiredAt ?? '';
        if (orderBy === 'vendor') return c.vendor ?? '';
        const col = specCols.find(sc => sc.key === orderBy);
        if (col) {
            const v = col.get(c, parseSpecJson(c));
            if (typeof v === 'number') return v;
            if (typeof v === 'boolean') return v ? 1 : 0;
            return String(v ?? '').toLowerCase();
        }
        return '';
    }, [specCols, priceBasis]);

    // What a cell READS AS - filtering offers the values the eye sees in the column,
    // not the sort key behind them.
    const cellText = useCallback((c: LabComponentFull, field: string): string => {
        switch (field) {
            case 'name': return componentDisplayName(c);
            case 'status': return getComponentStatusInfo(c.status).label;
            case 'location': return [c.currentMachineName, c.spaceName || c.machineSpaceName].filter(Boolean).join(' / ') || 'Shelf';
            case 'releaseYear': return componentReleased(c) ?? '';
            case 'acquired': return c.acquiredAt ? c.acquiredAt.substring(0, 10) : '';
            case 'vendor': return c.vendor ?? '';
            default: {
                const col = specCols.find(sc => sc.key === field);
                if (!col) return '';
                const v = col.get(c, parseSpecJson(c));
                return v === true ? 'Yes' : v === false ? 'No' : String(v ?? '');
            }
        }
    }, [specCols]);

    const sorted = useMemo(() => {
        const filtered = items.filter(c => passesFilters(c, filters, cellText));
        const dir = sort.order === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const av = sortValue(a, sort.orderBy);
            const bv = sortValue(b, sort.orderBy);
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv)) * dir;
        });
    }, [items, sort, sortValue, filters, cellText]);

    // Money and count columns are answered by sorting, not by picking values - a filter
    // list of ninety distinct prices helps nobody.
    const filterable = (key: string) =>
        !['msrp', 'basis', 'price', 'delta', 'files', 'actions'].includes(key);

    // ⚠️ One scan of items per COLUMN, memoised - not one per render of each header
    // cell. Called inline from every filter button, distinctValues(items, ...) would re-derive
    // every dropdown's options on every keystroke across hundreds of header cells.
    const distinctByColumn = useMemo(() => {
        const cache = new Map<string, string[]>();
        return (key: string) => {
            let v = cache.get(key);
            if (!v) { v = distinctValues(items, (c) => cellText(c, key)); cache.set(key, v); }
            return v;
        };
    }, [items, cellText]);

    const headerCell = (key: string, label: string, align: 'left' | 'right' = 'left') => (
        <TableCell key={key} align={align} sx={HEADER_CELL_SX}
            sortDirection={sort.orderBy === key ? sort.order : false}>
            <Box sx={HEADER_INNER_SX}>
                <TableSortLabel
                    active={sort.orderBy === key}
                    direction={sort.orderBy === key ? sort.order : 'asc'}
                    onClick={() => setSort(prev => ({ orderBy: key, order: prev.orderBy === key && prev.order === 'asc' ? 'desc' : 'asc' }))}
                >
                    {label}
                </TableSortLabel>
                {filterable(key) && (
                    <ColumnFilterButton
                        label={label}
                        // Values come from the section's full item list, so a column's
                        // options do not vanish as you filter a different column.
                        values={distinctByColumn(key)}
                        selected={filters[key] ?? []}
                        onChange={(next) => setFilters(prev => ({ ...prev, [key]: next }))}
                    />
                )}
            </Box>
        </TableCell>
    );

    const renderSpecValue = (col: SectionColumn, c: LabComponentFull) => {
        const v = col.get(c, parseSpecJson(c));
        if (v === null || v === undefined || v === '') {
            return <Typography variant="caption" color="text.secondary">{'—'}</Typography>;
        }
        if (typeof v === 'boolean') {
            return v ? <CheckIcon sx={{ fontSize: 16 }} color="success" /> : <Typography variant="caption" color="text.secondary">{'—'}</Typography>;
        }
        if (col.multiline) {
            const lines = String(v).split('\n').map(l => l.trim()).filter(Boolean);
            return (
                <Box>
                    {lines.map((line, i) => (
                        <Typography key={i} variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                            {lines.length > 1 ? `• ${line}` : line}
                        </Typography>
                    ))}
                </Box>
            );
        }
        return <Typography variant="body2">{`${v}${col.unit ?? ''}`}</Typography>;
    };

    const renderCell = (field: string, c: LabComponentFull) => {
        switch (field) {
            case 'name': {
                const spec = parseSpecJson(c);
                // The linked parent wins over the free-text note when both exist.
                const parentName = c.parentComponentName || spec.integratedWith;
                const integrated = parentName
                    ? `Integrated with: ${parentName}`
                    : spec.integratedParts ? `Has integrated: ${spec.integratedParts}` : null;
                return (
                    <>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {/* Same click path as the machine view: the name opens the
                                component's own page - market history, invoice, details. */}
                            <Typography
                                fontWeight="medium"
                                color="text.primary"
                                onClick={(e) => { e.stopPropagation(); navigate(`/homelab/component/${c.id}`); }}
                                sx={{
                                    whiteSpace: 'nowrap',
                                    cursor: 'pointer',
                                    '&:hover': { textDecoration: 'underline' }
                                }}
                            >
                                {componentDisplayName(c)}
                            </Typography>
                            {integrated && (
                                <Tooltip title={integrated}>
                                    <LinkIcon sx={{ fontSize: 16, color: 'info.main' }} />
                                </Tooltip>
                            )}
                        </Box>
                        {(c.serialNumber || c.sku) && (
                            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 300 }}>
                                {c.serialNumber || c.sku}
                            </Typography>
                        )}
                    </>
                );
            }
            case 'status':
                return <StatusChip status={c.status} />;
            case 'location':
                return <LocationCell component={c} />;
            case 'msrp':
                if (isIntegratedChild(c)) return 'N/A';
                return c.msrp != null ? `$${c.msrp.toFixed(2)}` : '—';
            case 'basis': {
                if (isIntegratedChild(c)) return 'N/A';
                const b = basisPrice(c, priceBasis);
                if (b == null) return '—';
                // Only the Today basis is dated — an observation needs its capture date to
                // be read; List @ Purchase is implicitly dated by the purchase itself.
                const d = priceBasis === 'today' ? basisDate(c, priceBasis) : null;
                const fromMsrp = basisIsMsrpFallback(c, priceBasis);
                // Colour only tracks the LIVE comparison: New Today against Paid, tinted by
                // the Homelab price-color lens. List @ Purchase stays plain — it is a
                // historical fact, and the Discount column already tells the deal story.
                const paid = c.purchasePrice;
                const todayColor = priceBasis === 'today' && paid != null
                    ? vsPaidColor(b - paid, getPriceColorMode()) : null;
                return (
                    <>
                        <Typography variant="body2" sx={{
                            whiteSpace: 'nowrap',
                            ...(todayColor ? { fontWeight: 600, color: todayColor } : {})
                        }}>
                            {`$${b.toFixed(2)}`}
                        </Typography>
                        {d && (
                            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', display: 'block' }}>
                                {d}
                            </Typography>
                        )}
                        {fromMsrp && (
                            <Tooltip title="No list price at purchase was recorded, so this compares against launch MSRP - which ignores any price movement between launch and the day you bought it.">
                                <Typography variant="caption" sx={{ whiteSpace: 'nowrap', display: 'block', color: 'text.disabled', fontStyle: 'italic' }}>
                                    vs MSRP
                                </Typography>
                            </Tooltip>
                        )}
                    </>
                );
            }
            case 'price': {
                if (isIntegratedChild(c)) return 'N/A';
                if (c.purchasePrice == null) return '—';
                // Paid stays neutral: the basis column already colours itself green/red
                // against Paid, and a second highlight on the same comparison is noise.
                return (
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                        {`$${c.purchasePrice.toFixed(2)}`}
                    </Typography>
                );
            }
            case 'delta':
                if (isIntegratedChild(c)) return 'N/A';
                return <DeltaCell component={c} basis={priceBasis} />;
            case 'releaseYear':
                return componentReleased(c) ?? '—';
            case 'acquired':
                return c.acquiredAt ? new Date(c.acquiredAt).toLocaleDateString() : '—';
            case 'vendor':
                return <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{c.vendor || '—'}</Typography>;
            case 'files':
                return <AttachmentsCell component={c} actions={actions} />;
            case 'actions':
                return <ActionButtons component={c} actions={actions} />;
            default: {
                const col = specCols.find(sc => sc.key === field);
                return col ? renderSpecValue(col, c) : null;
            }
        }
    };

    return (
        <>
        <Accordion
            expanded={expanded}
            onChange={alwaysExpanded ? undefined : () => setExpanded(!expandedState)}
            // unmountOnExit is NOT cosmetic: MUI keeps AccordionDetails children mounted by
            // default, so all ~50 type sections had their full table in the DOM whether open
            // or not - 2,166 rows and 16,309 cells while ten sections showed. One sort click
            // then blocked the renderer past 45 seconds.
            TransitionProps={{ timeout: expanded ? undefined : 0, unmountOnExit: true }}
            sx={{ mb: 1 }}
        >
            <AccordionSummary
                expandIcon={alwaysExpanded ? undefined : <ExpandMoreIcon />}
                sx={{ pr: 2, ...(alwaysExpanded ? { cursor: 'default', '&:hover:not(.Mui-disabled)': { cursor: 'default' } } : {}) }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <span style={{ fontSize: '1.1rem' }}>{COMPONENT_TYPE_EMOJI[type] || '⚙️'}</span>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {title}
                            {' '}({activeFilterCount(filters) > 0 ? `${sorted.length} of ${items.length}` : items.length})
                        </Typography>
                        {/* A filtered section that LOOKS short is the trap; say so in the
                            header, and put the way out right next to the count. */}
                        {activeFilterCount(filters) > 0 && (
                            <Button
                                size="small" variant="text" color="inherit"
                                startIcon={<FilterAltOffIcon fontSize="small" />}
                                onClick={(e) => { e.stopPropagation(); setFilters({}); }}
                                sx={{ textTransform: 'none', color: 'primary.main' }}
                            >
                                Clear filters
                            </Button>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                        <Button
                            variant="contained" color="primary" size="small" startIcon={<AddIcon />}
                            onClick={(e) => { e.stopPropagation(); onAdd(type); }}
                        >
                            Add
                        </Button>
                        <IconButton size="small" onClick={openColPicker}>
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                {visibleColumns.map((field) => {
                                    const def = sectionColumnDefs.find(d => d.field === field)!;
                                    return headerCell(field, def.label, (def.align ?? 'left') as 'left' | 'right');
                                })}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sorted.map((c) => (
                                <TableRow key={c.id} hover>
                                    {visibleColumns.map((field) => {
                                        const def = sectionColumnDefs.find(d => d.field === field)!;
                                        return (
                                            <TableCell key={field} align={def.align}
                                                sx={NOWRAP_FIELDS.has(field) ? CELL_SX_NOWRAP : CELL_SX}>
                                                {renderCell(field, c)}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))}
                            {(visibleColumns.includes('msrp') || visibleColumns.includes('basis') || visibleColumns.includes('price') || visibleColumns.includes('delta')) && sorted.length > 0 && (
                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    {visibleColumns.map((field, i) => {
                                        const def = sectionColumnDefs.find(d => d.field === field)!;
                                        let content: React.ReactNode = i === 0 ? 'Subtotal' : null;
                                        if (field === 'msrp') {
                                            const sum = sorted.reduce((s, c) => s + (c.msrp ?? 0), 0);
                                            content = sum > 0 ? `$${sum.toFixed(2)}` : '—';
                                        }
                                        if (field === 'basis') {
                                            const sum = sorted.reduce((s, c) => s + (basisPrice(c, priceBasis) ?? 0), 0);
                                            content = sum > 0 ? `$${sum.toFixed(2)}` : '—';
                                        }
                                        if (field === 'price') {
                                            const sum = sorted.reduce((s, c) => s + (c.purchasePrice ?? 0), 0);
                                            content = sum > 0 ? `$${sum.toFixed(2)}` : '—';
                                        }
                                        if (field === 'delta') {
                                            const both = sorted.filter(c => basisPrice(c, priceBasis) != null && c.purchasePrice != null);
                                            content = both.length > 0
                                                ? deltaDisplay(both.reduce((s, c) => s + (basisPrice(c, priceBasis)! - c.purchasePrice!), 0))
                                                : '—';
                                        }
                                        return (
                                            <TableCell key={field} align={def.align} sx={SUBTOTAL_CELL_SX}>
                                                {content}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </AccordionDetails>
        </Accordion>

        {/* Per-section column picker (shared component, incl. reordering) */}
        <ColumnPickerPopover
            allColumns={sectionColumnDefs}
            orderedColumns={orderedColumns}
            hiddenColumns={hiddenColumns}
            anchorEl={colPickerAnchor}
            onClose={closeColPicker}
            onToggle={toggleColumn}
            onMove={moveColumn}
            onReset={resetToDefault}
        />
        </>
    );
};

// ⚠️ HOISTED ON PURPOSE - do not inline these back into the cells. MUI processes every
// `sx` OBJECT it is handed, and an object literal inside a render loop is a new reference
// each pass, so it can never hit the style cache. With ~1075 components x ~10 visible
// columns that was ~10,000 style computations per render, and it is why Inventory took
// seconds to paint while the query behind it ran in 45ms.
const CELL_SX = { padding: '8px 16px' } as const;
const CELL_SX_NOWRAP = { padding: '8px 16px', whiteSpace: 'nowrap' } as const;
const SUBTOTAL_CELL_SX = { padding: '8px 16px', fontWeight: 600, whiteSpace: 'nowrap' } as const;
const HEADER_CELL_SX = { fontWeight: 600, whiteSpace: 'nowrap', padding: '8px 16px' } as const;
const HEADER_INNER_SX = { display: 'inline-flex', alignItems: 'center' } as const;
const NOWRAP_FIELDS = new Set(['msrp', 'basis', 'price', 'delta']);

const HomelabInventory = () => {
    usePageTitle('Homelab Inventory');

    // The vocabulary drives section order, titles and per-section columns. Editing it in the
    // dialog below changes THIS page - that is the point of it living here.
    const { typeNames, titleFor, columnsFor, reload: reloadTypes } = useComponentTypes();
    const [typesDialogOpen, setTypesDialogOpen] = useState(false);

    const [components, setComponents] = useState<LabComponentFull[]>([]);
    const [machines, setMachines] = useState<LabMachine[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    // ⚠️ Refetches must not unmount the table. Swapping it for a spinner collapses the
    // document to a few pixels, the browser clamps scrollTop to 0, and the reader is thrown
    // back to the top every time they add or delete a component. Only the first load blanks
    // the page; every refresh after that redraws in place under a hairline progress bar.
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addModalType, setAddModalType] = useState<string | undefined>(undefined);
    const [movingComponent, setMovingComponent] = useState<LabComponentFull | null>(null);
    const [attachComponent, setAttachComponent] = useState<LabComponentFull | null>(null);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Sync the price-color lens from the settings DB; re-render if it changed.
    const [, setColorModeTick] = useState(0);
    useEffect(() => { refreshPriceColorMode().then(() => setColorModeTick(t => t + 1)); }, []);

    // Inventory (what I own) vs Graveyard (what left, and why) — not persisted, because
    // the inventory is the answer to "what have I got" and should be what a fresh load shows.
    const navigate = useNavigate();
    const [tab, setTab] = useState<'inventory' | 'recent' | 'graveyard'>('inventory');

    // Recently Added window - "what did I buy lately". Keyed on acquiredAt (the Purchase
    // Date column), NOT createdAt. Filing date was tried first and put four
    // ESP boards bought in September 2025 under "recent" because their invoice was filed a
    // year later. A row with no purchase date has no claim to the window and stays out.
    const [recentWindow, setRecentWindow] = useState<RecentWindow>(() => {
        try {
            const s = JSON.parse(localStorage.getItem(STORAGE_KEY_INVENTORY_RECENT_WINDOW) || 'null');
            return s && ['7', '30', '90', 'custom'].includes(s.window) ? s.window : '30';
        } catch { return '30'; }
    });
    const [recentFrom, setRecentFrom] = useState<string>(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_INVENTORY_RECENT_WINDOW) || 'null')?.from ?? ''; } catch { return ''; }
    });
    const [recentTo, setRecentTo] = useState<string>(() => {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_INVENTORY_RECENT_WINDOW) || 'null')?.to ?? ''; } catch { return ''; }
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_INVENTORY_RECENT_WINDOW, JSON.stringify({ window: recentWindow, from: recentFrom, to: recentTo }));
    }, [recentWindow, recentFrom, recentTo]);

    const recentRange = useMemo<{ from: number | null, to: number | null }>(() => {
        if (recentWindow === 'custom') {
            return {
                from: recentFrom ? new Date(`${recentFrom}T00:00:00`).getTime() : null,
                to: recentTo ? new Date(`${recentTo}T23:59:59.999`).getTime() : null,
            };
        }
        const from = new Date();
        from.setDate(from.getDate() - Number(recentWindow));
        from.setHours(0, 0, 0, 0);
        return { from: from.getTime(), to: null };
    }, [recentWindow, recentFrom, recentTo]);

    const inRecentWindow = useCallback((c: LabComponentFull) => {
        if (!c.acquiredAt) return false;
        const t = new Date(c.acquiredAt).getTime();
        if (Number.isNaN(t)) return false;
        if (recentRange.from != null && t < recentRange.from) return false;
        if (recentRange.to != null && t > recentRange.to) return false;
        return true;
    }, [recentRange]);

    // ⚠️ NOT persisted, unlike the shelf filter below. A search is a question you are asking
    // right now; restoring one on the next visit shows a page that looks half-empty for a
    // reason nobody remembers typing.
    const [search, setSearch] = useState('');

    // Shelf-only filter — persisted, applies to every section
    const [shelfOnly, setShelfOnly] = useState<boolean>(() =>
        localStorage.getItem(STORAGE_KEY_INVENTORY_SHELF_FILTER) === 'true');
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_INVENTORY_SHELF_FILTER, String(shelfOnly));
    }, [shelfOnly]);

    // Price basis: MSRP vs current List Price — persisted
    // Stored values from the old MSRP/List toggle ('msrp'/'list') fall through to the default.
    const [priceBasis, setPriceBasis] = useState<PriceBasis>(() => {
        const stored = localStorage.getItem('lab_inventory_price_basis');
        // Default is At Purchase - the discount he got is the
        // resting question; New Today is the mode he switches INTO.
        return stored === 'purchase' || stored === 'today' ? stored : 'purchase';
    });
    useEffect(() => {
        localStorage.setItem('lab_inventory_price_basis', priceBasis);
    }, [priceBasis]);

    // Expand/collapse-all: sections report their state up; the header toggle
    // broadcasts a bulk signal down (seq bumps so repeated clicks re-apply)
    const [sectionStates, setSectionStates] = useState<Record<string, boolean>>({});
    const [bulkExpand, setBulkExpand] = useState<{ value: boolean, seq: number } | undefined>(undefined);
    const handleSectionExpandedChange = useCallback((type: string, isExpanded: boolean) => {
        setSectionStates(prev => prev[type] === isExpanded ? prev : { ...prev, [type]: isExpanded });
    }, []);

    // "All Components" accordion state + its legacy sort/columns
    const [allExpanded, setAllExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem(STORAGE_KEY_INVENTORY_ALL_EXPANDED);
        return s !== null ? JSON.parse(s) : false;
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_INVENTORY_ALL_EXPANDED, JSON.stringify(allExpanded));
    }, [allExpanded]);

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_INVENTORY_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'type', order: 'asc' };
        } catch {
            return { orderBy: 'type', order: 'asc' };
        }
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_INVENTORY_SORT, JSON.stringify(sortState));
    }, [sortState]);

    const [allFilters, setAllFilters] = useState<ColumnFilters>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_INVENTORY_ALL_FILTERS);
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_INVENTORY_ALL_FILTERS, JSON.stringify(allFilters));
    }, [allFilters]);

    const allColumns = useMemo<ColumnDefinition<string>[]>(() => INVENTORY_COLUMNS, []);
    const {
        visibleColumns, orderedColumns, hiddenColumns,
        toggleColumn, moveColumn, resetToDefault,
        anchorEl: colPickerAnchor, openPopover: openColPicker, closePopover: closeColPicker,
    } = useColumnVisibility(STORAGE_KEY_INVENTORY_COLUMNS, allColumns);

    const showSnackbar = useCallback((message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

    const fetchData = useCallback(async () => {
        try {
            setRefreshing(true);
            const [componentsRes, machinesRes] = await Promise.all([
                fetch("/api/lab/components"),
                fetch("/api/lab/machines"),
            ]);
            if (!componentsRes.ok) throw new Error("Failed to fetch components");
            setComponents(await componentsRes.json());
            if (machinesRes.ok) setMachines(await machinesRes.json());
        } catch (err) {
            showSnackbar("Error fetching inventory", "error");
            console.error("Error fetching inventory:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [showSnackbar]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Mobile bottom action bar events
    useEffect(() => {
        const handleAdd = () => { setAddModalType(undefined); setAddModalOpen(true); };
        const handleRefresh = () => fetchData();
        window.addEventListener('bottom-action-add-component', handleAdd);
        window.addEventListener('bottom-action-refresh', handleRefresh);
        return () => {
            window.removeEventListener('bottom-action-add-component', handleAdd);
            window.removeEventListener('bottom-action-refresh', handleRefresh);
        };
    }, [fetchData]);

    const forceDelete = async (component: LabComponentFull) => {
        if (!window.confirm(`FORCE delete ${componentDisplayName(component)}? This permanently erases the component, its movement history, and its attachments.`)) return false;
        const response = await fetch(`/api/lab/components/${component.id}?force=true`, { method: 'DELETE' });
        if (!response.ok) throw new Error(await response.text());
        showSnackbar('Component force-deleted (history erased)', 'info');
        return true;
    };

    const handleDelete = async (component: LabComponentFull) => {
        try {
            // Already-disposed rows only have one way out
            if (component.status === 'disposed') {
                if (await forceDelete(component)) fetchData();
                return;
            }
            if (!window.confirm(`Delete ${componentDisplayName(component)}? If it has movement history it will be marked disposed instead.`)) return;
            const response = await fetch(`/api/lab/components/${component.id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(await response.text());
            if (response.status === 204) {
                showSnackbar('Component deleted', 'info');
            } else {
                // Had history -> disposed; offer the nuclear option
                await forceDelete(component);
            }
            fetchData();
        } catch (err) {
            showSnackbar(`Failed to delete: ${errorMessage(err)}`, 'error');
        }
    };

    const actions: ComponentActions = {
        onMove: (c) => setMovingComponent(c),
        onDelete: handleDelete,
        onAttachments: (c) => setAttachComponent(c),
    };

    const handleAdd = (type?: string) => {
        setAddModalType(type);
        setAddModalOpen(true);
    };

    // The Graveyard is the same inventory seen from the other side: parts that left the
    // fleet, and why. Keeping them out of the main list is what makes the totals mean
    // "what I own" - and keeping them in their own tab is what stops them being deleted
    // to get them out of the way.
    const inService = useMemo(() => components.filter(c => !isRetiredStatus(c.status)), [components]);
    const graveyard = useMemo(() => components.filter(c => isRetiredStatus(c.status)), [components]);
    // Recently Added is the in-service inventory seen through the date window - same
    // sections, same columns, only the rows purchased inside the window and only the
    // categories that have one.
    const recent = useMemo(() => inService.filter(inRecentWindow), [inService, inRecentWindow]);

    // 🔑 ONE SEARCH ACROSS EVERY SECTION, applied before the type grouping rather than inside
    // it - so a query collapses the whole page down to matches wherever they live, instead of
    // making you open each section and look. Sections that match nothing render empty, which is
    // the same rule as an unused type: a heading with no rows still tells you it found nothing.
    const searchTerms = useMemo(() => fuzzyTerms(search), [search]);
    const searchable = useCallback((c: LabComponentFull) => [
        componentDisplayName(c), c.type, c.manufacturer, c.model, c.nickname, c.spec,
        c.serialNumber, c.sku, c.source, c.vendor, c.notes,
        c.currentMachineName, c.spaceName, c.machineSpaceName,
    ].filter(Boolean).join(' '), []);

    const preSearch = useMemo(() =>
        tab === 'graveyard'
            ? graveyard
            : tab === 'recent'
                ? recent
                : inService.filter(c => !shelfOnly || !c.currentMachineId),
        [tab, graveyard, recent, inService, shelfOnly]);

    const filtered = useMemo(
        () => searchTerms.length ? preSearch.filter(c => fuzzyMatch(searchable(c), searchTerms)) : preSearch,
        [preSearch, searchTerms, searchable]);

    const byType = useMemo(() => {
        const map = new Map<string, LabComponentFull[]>();
        for (const c of filtered) {
            const key = typeNames.includes(c.type) ? c.type : 'Other';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(c);
        }
        return map;
    }, [filtered, typeNames]);

    const shelfCount = useMemo(() => inService.filter(c => !c.currentMachineId).length, [inService]);

    // Cell text for the cross-type table's column filters — what the eye reads.
    const allCellText = useCallback((c: LabComponentFull, field: string): string => {
        switch (field) {
            case 'type': return c.type;
            case 'name': return componentDisplayName(c);
            case 'spec': return c.spec ?? '';
            case 'status': return getComponentStatusInfo(c.status).label;
            case 'currentMachineName': return [c.currentMachineName, c.spaceName || c.machineSpaceName].filter(Boolean).join(' / ') || 'Shelf';
            case 'releaseYear': return componentReleased(c) ?? '';
            case 'source': return c.source ?? '';
            case 'serialNumber': return c.serialNumber ?? '';
            default: return '';
        }
    }, []);

    const allFilterable = (key: string) =>
        !['msrp', 'purchasePrice', 'actions'].includes(key);

    // Legacy cross-type sort for the All Components table
    const sortedAll = useMemo(() => {
        const allSortValue = (c: LabComponentFull, field: string): string | number | null | undefined => {
            switch (field) {
                case 'type': return c.type;
                case 'name': return componentDisplayName(c);
                case 'spec': return c.spec;
                case 'status': return c.status;
                case 'currentMachineName': return c.currentMachineName || '';
                case 'releaseYear': return componentReleased(c);
                case 'msrp': return c.msrp;
                case 'purchasePrice': return c.purchasePrice;
                case 'source': return c.source;
                case 'serialNumber': return c.serialNumber;
                default: return undefined;
            }
        };
        const { orderBy, order } = sortState;
        const dir = order === 'asc' ? 1 : -1;
        return [...filtered.filter(c => passesFilters(c, allFilters, allCellText))].sort((a, b) => {
            const av = allSortValue(a, orderBy);
            const bv = allSortValue(b, orderBy);
            if (typeof av === 'number' || typeof bv === 'number') return ((typeof av === 'number' ? av : 0) - (typeof bv === 'number' ? bv : 0)) * dir;
            return String(av ?? '').toLowerCase().localeCompare(String(bv ?? '').toLowerCase()) * dir;
        });
    }, [filtered, sortState, allFilters, allCellText]);

    const getAllCell = (component: LabComponentFull, field: string) => {
        switch (field) {
            case 'type':
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span style={{ fontSize: '1rem' }}>{COMPONENT_TYPE_EMOJI[component.type] || '⚙️'}</span>
                        <Chip label={component.type} size="small" />
                    </Box>
                );
            case 'name':
                // Same click path as the per-type sections: the name opens the component's
                // own page. Without this the Graveyard has no way in at all - it renders
                // ONLY this table, so a dead name cell means a dead tab.
                return (
                    <Typography
                        fontWeight="medium"
                        color="text.primary"
                        onClick={(e) => { e.stopPropagation(); navigate(`/homelab/component/${component.id}`); }}
                        sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                    >
                        {componentDisplayName(component)}
                    </Typography>
                );
            case 'spec':
                return <Typography variant="body2" color="text.secondary">{component.spec || '—'}</Typography>;
            case 'status':
                return <StatusChip status={component.status} />;
            case 'currentMachineName':
                return <LocationCell component={component} />;
            case 'releaseYear':
                return componentReleased(component) ?? '—';
            case 'msrp':
                return component.msrp != null ? `$${component.msrp.toFixed(2)}` : '—';
            case 'purchasePrice':
                return component.purchasePrice != null ? `$${component.purchasePrice.toFixed(2)}` : '—';
            case 'source':
                return component.source || '—';
            case 'serialNumber':
                return <Typography variant="body2" color="text.secondary">{component.serialNumber || '—'}</Typography>;
            case 'actions':
                return <ActionButtons component={component} actions={actions} />;
            default:
                return null;
        }
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h6">Inventory</Typography>
                    {!loading && tab === 'inventory' && shelfCount > 0 && (
                        <Chip label={`${shelfCount} on shelf`} size="small" />
                    )}
                </Box>
                {!isMobile && tab === 'inventory' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LabPriceColorsToggle onChanged={() => setColorModeTick(t => t + 1)} />
                        <ToggleButtonGroup
                            value={priceBasis}
                            exclusive
                            onChange={(_, v) => { if (v) setPriceBasis(v); }}
                            size="small"
                            aria-label="price basis"
                        >
                            <ToggleButton value="purchase" title="How good a purchase was this the day I bought it? Compares paid against the list price at purchase.">At Purchase</ToggleButton>
                            <ToggleButton value="today" title="How good is it vs what it costs today, new? Compares paid against the latest market observation.">Today</ToggleButton>
                        </ToggleButtonGroup>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ color: shelfOnly ? 'info.main' : 'text.disabled', fontWeight: 600 }}>
                                SHELF ONLY
                            </Typography>
                            <Switch
                                checked={shelfOnly}
                                onChange={(e) => setShelfOnly(e.target.checked)}
                                size="small"
                                color="info"
                            />
                        </Box>
                        <TextField
                            size="small" value={search} placeholder="Search all sections…"
                            onChange={e => setSearch(e.target.value)}
                            sx={{ minWidth: 260 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" color="disabled" />
                                    </InputAdornment>
                                ),
                                endAdornment: search ? (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setSearch('')} edge="end">
                                            <ClearIcon fontSize="small" />
                                        </IconButton>
                                    </InputAdornment>
                                ) : undefined,
                            }}
                        />
                        <Button
                            variant="outlined" size="small" startIcon={<CategoryIcon />}
                            onClick={() => setTypesDialogOpen(true)}
                        >
                            Manage Types
                        </Button>
                        <Button
                            variant="contained" color="primary" size="small" startIcon={<AddIcon />}
                            onClick={() => handleAdd(undefined)}
                        >
                            Add Component
                        </Button>
                        {(() => {
                            const typesShown = typeNames;
                            // Only the type sections count now - the All Components card
                            // left the Inventory tab.
                            const anyCollapsed = typesShown.some(t => sectionStates[t] === false);
                            return (
                                <Tooltip title={anyCollapsed ? 'Expand all sections' : 'Collapse all sections'}>
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            setBulkExpand(prev => ({ value: anyCollapsed, seq: (prev?.seq ?? 0) + 1 }));
                                        }}
                                    >
                                        {anyCollapsed ? <UnfoldMoreIcon fontSize="small" /> : <UnfoldLessIcon fontSize="small" />}
                                    </IconButton>
                                </Tooltip>
                            );
                        })()}
                    </Box>
                )}
                {!isMobile && tab === 'recent' && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LabPriceColorsToggle onChanged={() => setColorModeTick(t => t + 1)} />
                        <ToggleButtonGroup
                            value={priceBasis}
                            exclusive
                            onChange={(_, v) => { if (v) setPriceBasis(v); }}
                            size="small"
                            aria-label="price basis"
                        >
                            <ToggleButton value="purchase" title="How good a purchase was this the day I bought it? Compares paid against the list price at purchase.">At Purchase</ToggleButton>
                            <ToggleButton value="today" title="How good is it vs what it costs today, new? Compares paid against the latest market observation.">Today</ToggleButton>
                        </ToggleButtonGroup>
                        <TextField
                            size="small" value={search} placeholder="Search recent…"
                            onChange={e => setSearch(e.target.value)}
                            sx={{ minWidth: 220 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" color="disabled" />
                                    </InputAdornment>
                                ),
                                endAdornment: search ? (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setSearch('')} edge="end">
                                            <ClearIcon fontSize="small" />
                                        </IconButton>
                                    </InputAdornment>
                                ) : undefined,
                            }}
                        />
                        {/* No expand/collapse here: Recently Added is a short report and every
                            section stays open. The date window sits last, top right - it is the one control that
                            defines this tab, so it gets the corner the eye goes to. */}
                        <ToggleButtonGroup
                            value={recentWindow}
                            exclusive
                            onChange={(_, v) => { if (v) setRecentWindow(v); }}
                            size="small"
                            aria-label="recently added window"
                        >
                            {RECENT_PRESETS.map(p => (
                                <ToggleButton key={p.value} value={p.value} title={p.value === 'custom' ? 'Pick a from/to purchase date' : `Purchased in the last ${p.value} days`}>
                                    {p.label}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                        {recentWindow === 'custom' && (
                            <>
                                <TextField
                                    size="small" type="date" label="From" value={recentFrom}
                                    onChange={e => setRecentFrom(e.target.value)}
                                    InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
                                />
                                <TextField
                                    size="small" type="date" label="To" value={recentTo}
                                    onChange={e => setRecentTo(e.target.value)}
                                    InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
                                />
                            </>
                        )}
                    </Box>
                )}
                {!isMobile && tab === 'graveyard' && (
                    <Button
                        variant="contained" color="primary" size="small" startIcon={<AddIcon />}
                        onClick={() => handleAdd(undefined)}
                    >
                        Add Component
                    </Button>
                )}
            </Box>

            <Tabs
                value={tab}
                onChange={(_, v) => setTab(v)}
                sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', minHeight: 40 }}
            >
                <Tab value="inventory" label={`Inventory (${inService.length})`} sx={{ minHeight: 40 }} />
                <Tab
                    value="recent"
                    label={`Recently Added (${recent.length})`}
                    icon={<FiberNewIcon fontSize="small" />}
                    iconPosition="start"
                    sx={{ minHeight: 40 }}
                />
                <Tab
                    value="graveyard"
                    label={`Graveyard (${graveyard.length})`}
                    icon={<HeartBrokenIcon fontSize="small" />}
                    iconPosition="start"
                    sx={{ minHeight: 40 }}
                />
            </Tabs>

            <Box sx={{ height: 2 }}>{refreshing && !loading && <LinearProgress sx={{ height: 2 }} />}</Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : (
                <>
                    {/* PCPartPicker-style: one section per component type, in canonical order */}
                    {/* ⛔ EMPTY TYPES STILL RENDER WHILE BROWSING. Filtering them out made a type
                        you had just created invisible - and therefore unusable, since the
                        per-section Add button is how you file the first part into it. An empty
                        section reads as "this category exists and has nothing in it", which is
                        the truth.

                        ⚠️ BUT NOT WHILE SEARCHING. That reasoning is about discovering and
                        filling a category; a search is asking "where is this part", and answering
                        it with a wall of empty headings buries the hit. So when a search term is
                        active, sections with no match are hidden - the Add buttons are all still
                        one cleared search away.

                        Recently Added hides empty sections always: the tab is a report of
                        what arrived, and a category nothing arrived in is not part of the
                        answer. Adding still happens on the Inventory tab. */}
                    {tab === 'recent' && recent.length === 0 && (
                        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                            Nothing was purchased in this window.
                        </Typography>
                    )}
                    {(tab === 'inventory' || tab === 'recent') && typeNames
                        .filter(type => (tab === 'recent' || searchTerms.length) ? (byType.get(type)?.length ?? 0) > 0 : true)
                        .map(type => (
                        <TypeSection
                            title={titleFor(type)}
                            specCols={columnsFor(type)}
                            key={type}
                            type={type}
                            items={byType.get(type) ?? []}
                            actions={actions}
                            onAdd={handleAdd}
                            bulkExpand={bulkExpand}
                            onExpandedChange={handleSectionExpandedChange}
                            priceBasis={priceBasis}
                            alwaysExpanded={tab === 'recent'}
                        />
                    ))}

                    {/* Cross-type table with the column picker. Graveyard ONLY now: it is the
                        Graveyard's whole body, and on the other two tabs the type sections are
                        already the complete answer - a second copy of the same rows underneath
                        read as more than was there. */}
                    {tab === 'graveyard' && (
                    <Accordion
                        expanded={allExpanded}
                        onChange={() => setAllExpanded(!allExpanded)}
                        TransitionProps={{ timeout: allExpanded ? undefined : 0, unmountOnExit: true }}
                    >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pr: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                        {tab === 'graveyard' ? 'Graveyard' : tab === 'recent' ? 'All Recently Added' : 'All Components'}
                                        {' '}({activeFilterCount(allFilters) > 0 ? `${sortedAll.length} of ${filtered.length}` : filtered.length})
                                    </Typography>
                                    {activeFilterCount(allFilters) > 0 && (
                                        <Button
                                            size="small" variant="text"
                                            startIcon={<FilterAltOffIcon fontSize="small" />}
                                            onClick={(e) => { e.stopPropagation(); setAllFilters({}); }}
                                            sx={{ textTransform: 'none' }}
                                        >
                                            Clear filters
                                        </Button>
                                    )}
                                </Box>
                                {!isMobile && allExpanded && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                                        <IconButton size="small" onClick={openColPicker}>
                                            <SettingsIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                )}
                            </Box>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 0 }}>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                                            {visibleColumns.map((field) => {
                                                const colDef = INVENTORY_COLUMNS.find((c) => c.field === field)!;
                                                return (
                                                    <TableCell
                                                        key={field}
                                                        align={colDef.align}
                                                        sortDirection={sortState.orderBy === field ? sortState.order : false}
                                                        sx={{
                                                            fontWeight: 600,
                                                            whiteSpace: 'nowrap',
                                                            padding: '8px 16px',
                                                            ...(colDef.width ? { width: colDef.width } : {}),
                                                        }}
                                                    >
                                                        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
                                                            {colDef.sortable !== false ? (
                                                                <TableSortLabel
                                                                    active={sortState.orderBy === field}
                                                                    direction={sortState.orderBy === field ? sortState.order : 'asc'}
                                                                    onClick={() => setSortState(prev => ({
                                                                        orderBy: field,
                                                                        order: prev.orderBy === field && prev.order === 'asc' ? 'desc' : 'asc',
                                                                    }))}
                                                                >
                                                                    {colDef.label}
                                                                </TableSortLabel>
                                                            ) : (
                                                                colDef.label
                                                            )}
                                                            {allFilterable(field) && (
                                                                <ColumnFilterButton
                                                                    label={colDef.label}
                                                                    values={distinctValues(filtered, (c) => allCellText(c, field))}
                                                                    selected={allFilters[field] ?? []}
                                                                    onChange={(next) => setAllFilters(prev => ({ ...prev, [field]: next }))}
                                                                />
                                                            )}
                                                        </Box>
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {sortedAll.length > 0 ? (
                                            sortedAll.map((component) => (
                                                <TableRow key={component.id} hover>
                                                    {visibleColumns.map((field) => {
                                                        const colDef = INVENTORY_COLUMNS.find((c) => c.field === field)!;
                                                        return (
                                                            <TableCell key={field} align={colDef.align} sx={{ padding: '8px 16px' }}>
                                                                {getAllCell(component, field)}
                                                            </TableCell>
                                                        );
                                                    })}
                                                </TableRow>
                                            ))
                                        ) : (
                                            <TableRow>
                                                <TableCell colSpan={visibleColumns.length} sx={{ textAlign: 'center', py: 3 }}>
                                                    <Typography color="textSecondary">
                                                        {components.length === 0
                                                            ? 'No components yet — add the parts you own to start tracking inventory.'
                                                            : 'No components match the current filters.'}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </AccordionDetails>
                    </Accordion>
                    )}
                </>
            )}

            {/* Column picker popover — All Components table only */}
            <ColumnPickerPopover
                allColumns={allColumns}
                orderedColumns={orderedColumns}
                hiddenColumns={hiddenColumns}
                anchorEl={colPickerAnchor}
                onClose={closeColPicker}
                onToggle={toggleColumn}
                onMove={moveColumn}
                onReset={resetToDefault}
            />

            <LabComponentAddModal
                open={addModalOpen}
                onClose={() => setAddModalOpen(false)}
                onSaved={(c) => { showSnackbar(`${componentDisplayName(c)} added`, "success"); fetchData(); }}
                onError={(msg) => showSnackbar(msg, "error")}
                defaultType={addModalType}
            />

            <LabComponentTypesDialog
                open={typesDialogOpen}
                onClose={() => setTypesDialogOpen(false)}
                onChanged={() => { reloadTypes(); fetchData(); }}
            />

            <LabComponentMoveDialog
                open={Boolean(movingComponent)}
                onClose={() => setMovingComponent(null)}
                onMoved={() => { showSnackbar('Component moved', 'success'); fetchData(); }}
                onError={(msg) => showSnackbar(msg, "error")}
                component={movingComponent}
                machines={machines}
            />

            <LabComponentAttachmentsDialog
                open={Boolean(attachComponent)}
                onClose={() => setAttachComponent(null)}
                component={attachComponent}
                onChanged={fetchData}
                onError={(msg) => showSnackbar(msg, "error")}
            />

            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={6000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackbarSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default HomelabInventory;
