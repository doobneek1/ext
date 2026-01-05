import React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import CloseIcon from "@mui/icons-material/Close";
import { fetchAuthSession } from "aws-amplify/auth";
import HeadCells from "./components/EntryCells/HeadCells.jsx";
import { getExactColumnWidth } from "./utils/columnWidthHelpers.js";
import PhoneNumberField from "./components/job/PhoneNumberField.jsx";
import {
  fetchLocationsByRadius,
  patchLocation,
  patchPhone,
  postLocationNote
} from "./services/sheetsApi.js";
import { getCognitoUserInfo } from "./creds.js";
import withStreetlivesAuth from "./streetlivesAuth/withStreetlivesAuth.jsx";
import { useAuthState } from "./contexts/AppStateProvider.js";
import { db, ref as firebaseRef, get, set } from "./firebase.js";

const LOCATION_QUERY = {
  latitude: 40.697488,
  longitude: -73.979681,
  radius: 34000
};
const NOTES_BASE_URL = "https://doobneek-fe7b7-default-rtdb.firebaseio.com/locationNotes";
const CACHE_TTL_MS = 15 * 60 * 1000;
const REVALIDATED_SENTINEL = "revalidated123435355342";
const COLLAPSED_COLUMNS_KEY = "sheets-collapsed-columns";

const buildCacheKey = () => {
  const lat = String(LOCATION_QUERY.latitude).replace(/[^0-9-]/g, "_");
  const lng = String(LOCATION_QUERY.longitude).replace(/[^0-9-]/g, "_");
  return `sheets_${lat}_${lng}_${LOCATION_QUERY.radius}`;
};

const normalizeUrl = (value) => {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const normalizeNoteText = (raw) => {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        return normalizeNoteText(parsed?.note || parsed?.summary || parsed?.text || trimmed);
      } catch (_error) {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof raw === "object") {
    return normalizeNoteText(raw?.note || raw?.summary || raw?.text || JSON.stringify(raw));
  }
  return String(raw).trim();
};

const parseNoteTimestamp = (dateKey, noteValue) => {
  if (noteValue && typeof noteValue === "object" && noteValue.date) {
    const parsed = Date.parse(noteValue.date);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    const parsed = Date.parse(dateKey);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const numeric = Number(dateKey);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(dateKey);
  if (!Number.isNaN(parsed)) return parsed;
  return null;
};

const formatNoteDateLabel = (dateKey, timestamp) => {
  if (dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  if (timestamp) return new Date(timestamp).toISOString().slice(0, 10);
  return dateKey || "";
};

const parseNotesPayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return {
      notes: [],
      latestNote: "",
      latestUser: "",
      latestDate: null,
      latestDateLabel: ""
    };
  }

  const notes = [];

  Object.entries(payload).forEach(([userKey, entries]) => {
    if (!entries || typeof entries !== "object") return;
    if (userKey.startsWith("_") || userKey === "stats" || userKey === "invocations") return;

    Object.entries(entries).forEach(([dateKey, noteValue]) => {
      const noteText = normalizeNoteText(noteValue);
      if (!noteText) return;

      const resolvedUser = noteValue?.userName ? String(noteValue.userName) : userKey;
      const timestamp = parseNoteTimestamp(dateKey, noteValue);
      notes.push({
        user: resolvedUser,
        note: noteText,
        date: timestamp,
        dateLabel: formatNoteDateLabel(dateKey, timestamp)
      });
    });
  });

  notes.sort((a, b) => (b.date || 0) - (a.date || 0));
  const latest = notes[0] || null;

  return {
    notes,
    latestNote: latest?.note || "",
    latestUser: latest?.user || "",
    latestDate: latest?.date || null,
    latestDateLabel: latest?.dateLabel || ""
  };
};

const isRevalidatedNote = (noteText) => {
  if (!noteText) return false;
  const normalized = String(noteText).trim().toLowerCase();
  if (normalized === REVALIDATED_SENTINEL) return true;

  const cleaned = normalized.replace(/revalidated\d+/g, "revalidated");
  if (!/\brevalidated\b/.test(cleaned)) return false;
  if (/\bdid(?:n'?t| not)\s+revalidat/.test(cleaned)) return false;
  if (/\bnot\s+revalidat/.test(cleaned)) return false;
  return true;
};

const normalizePhoneNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
};

const getLastValidatedTimestamp = (location) => {
  const raw = location?.last_validated_at || location?.lastValidatedAt || location?.lastValidated;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
};

const buildAddressPayload = (address, address1) => {
  const entry = {
    id: address?.id || undefined,
    location_id: address?.location_id || undefined,
    address_1: address1,
    address_2: address?.address_2 || undefined,
    city: address?.city || undefined,
    state_province: address?.state_province || undefined,
    postal_code: address?.postal_code || undefined,
    country: address?.country || undefined,
    region: address?.region || undefined
  };

  return {
    physical_addresses: [entry]
  };
};

const formatCacheTimestamp = (timestamp) => {
  if (!timestamp) return "unknown";
  try {
    return new Date(timestamp).toLocaleString();
  } catch (_error) {
    return "unknown";
  }
};

const COLUMN_ORDER = [
  "organization",
  "location",
  "services",
  "notes",
  "claim",
  "revalidated",
  "address",
  "website",
  "phones",
  "email",
  "gogetta"
];

const DEFAULT_COLUMN_WIDTHS = {
  organization: "12%",
  location: "10%",
  services: "14%",
  notes: "14%",
  claim: "7%",
  revalidated: "5%",
  address: "16%",
  website: "6%",
  phones: "8%",
  email: "6%",
  gogetta: "2%"
};

const MIN_COLUMN_WIDTH = 60;

const SheetsCell = ({
  columnKey,
  collapsedColumns,
  columnOrder,
  tableContainerRef,
  isMobile,
  children,
  collapsedContent = null
}) => {
  const isCollapsed = Boolean(collapsedColumns?.[columnKey]);
  const width = getExactColumnWidth({
    isCollapsed,
    mode: columnKey,
    isMobile,
    DEFAULT_COLUMN_WIDTHS,
    columnOrder,
    collapsedColumns,
    tableContainerRef
  });

  return (
    <TableCell
      sx={(theme) => ({
        flexBasis: width,
        width,
        minWidth: isCollapsed ? "10px" : "auto",
        maxWidth: isCollapsed ? "10px" : "none",
        display: "flex",
        alignItems: isCollapsed ? "center" : "stretch",
        justifyContent: isCollapsed ? "center" : "flex-start",
        padding: isCollapsed ? 0 : "6px 8px",
        overflow: "hidden",
        boxSizing: "border-box",
        flexShrink: 0,
        flexGrow: 0,
        ...(isCollapsed && {
          backgroundColor: "transparent",
          borderLeft: `1px solid ${theme.palette.divider}`
        }),
        "@media (max-width: 600px)": {
          width: `${width} !important`,
          minWidth: `${width} !important`,
          maxWidth: `${width} !important`,
          flexBasis: `${width} !important`
        }
      })}
    >
      {isCollapsed ? collapsedContent : children}
    </TableCell>
  );
};

const SheetsApp = () => null;

export default SheetsApp;
