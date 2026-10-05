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

namespace JunctionRelayServer.Models
{
    // Homelab module (LAB) — the NETWORK page as data: machines and switches, their ports and the links
    // between them, driven by the Lab inventory (a switch brings its ports with it) and editable in the web
    // UI and over MCP. Three tables, soft references only (no foreign keys - the Lab module stays removable
    // as a unit):
    //   node - a device on the page: a Lab machine, a Lab component (a switch, a modem) or a PLACEHOLDER for
    //          something not bought yet (a label and a typed port list; always planned). Its frame is the Lab
    //          Space it is placed in, unless SpaceId overrides it; Row/Position order it inside the frame.
    //   port - one port of a node: name, media (rj45 | sfp | sfp28 | qsfp | other), speed in Gb/s, the card
    //          edge it is drawn on, an optional module fitted in the cage (an inventory part - an SFP+ to RJ45
    //          transceiver) and the component that provides it (the NIC in a machine).
    //   link - port to port, live or planned. Its speed is never stored: it is the slower end.
    //   zone - a walled-off part of the network: dmz (servers exposed to the internet) or untrusted (devices
    //          kept off the LAN - an agents' box, IoT). Drawn as a red hatched outline around its devices; a
    //          device is in at most one zone (Lab_Network_ZoneNodes, keyed by NodeId).
    // Ports are generated once from a record's `ports` spec field ("4x RJ45 2.5G, 2x SFP+ 10G" on a switch;
    // a machine sums its installed NICs and motherboard) and are ordinary rows afterwards.
    public class Model_Lab_NetworkNode
    {
        public int Id { get; set; }
        public int? MachineId { get; set; }             // exactly one of MachineId / ComponentId, or neither for a placeholder
        public int? ComponentId { get; set; }
        public string? Label { get; set; }              // a placeholder's name; otherwise an optional display name ("Big Switch")
        public string? PortsSpec { get; set; }          // a placeholder's port list, same grammar as the spec field
        public string Status { get; set; } = "live";    // live | planned (placeholders are always planned)
        public int? SpaceId { get; set; }               // NULL = the Space the record is placed in; none = outside every frame
        public int Row { get; set; } = 1;               // within its frame (or outside: row <= 1 above the frames, >= 2 below)
        public int Position { get; set; }
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        // Read-side, resolved from the Lab - never stored.
        public string? DisplayName { get; set; }        // Label, else the machine name / manufacturer + model
        public string? RefLine { get; set; }            // "machine · Unraid", "component #1216 · TRENDnet TEG-S762", "placeholder"
        public int? ResolvedSpaceId { get; set; }
        public string? ResolvedSpaceName { get; set; }
        public string? PlacementNote { get; set; }      // "U7-U10"
        // The frame it is drawn in: its top-level Space (a room), and inside it the rack or desk it
        // sits in when that is not the room itself. A rack with no room is its own frame with no sub-frame.
        public int? FrameSpaceId { get; set; }
        public string? FrameSpaceName { get; set; }
        public int? SubSpaceId { get; set; }
        public string? SubSpaceName { get; set; }
        public bool Missing { get; set; }               // the machine/component it points at is gone
    }

    public class Model_Lab_NetworkPort
    {
        public int Id { get; set; }
        public int NodeId { get; set; }
        public string Name { get; set; } = string.Empty;   // "SFP+ 1", "2.5G-3", "LAN"
        public string Media { get; set; } = "rj45";        // rj45 | sfp | sfp28 | qsfp | other
        public double? SpeedGb { get; set; }
        public string Side { get; set; } = "bottom";       // left | right | top | bottom - the card edge it is drawn on
        public int Position { get; set; }                  // order along that edge
        public int? ModuleComponentId { get; set; }        // the part fitted in the cage (an SFP+ to RJ45 transceiver)
        public string? ModuleLabel { get; set; }           // when the module is not in the inventory
        public int? SourceComponentId { get; set; }        // the NIC / motherboard that provides it on a machine
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        public string? ModuleName { get; set; }            // read-side
        public string? SourceName { get; set; }
    }

    public class Model_Lab_NetworkLink
    {
        public int Id { get; set; }
        public int PortAId { get; set; }
        public int PortBId { get; set; }
        public string Status { get; set; } = "live";       // live | planned
        public string? Notes { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }

        public double? SpeedGb { get; set; }               // read-side: the slower end
    }

    public class Model_Lab_NetworkZone
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;   // "Sandbox", "IoT"
        public string Kind { get; set; } = "untrusted";    // dmz | untrusted
        public string? Notes { get; set; }
        public List<int> NodeIds { get; set; } = new();    // its devices; saving a zone replaces the list
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    // The whole page in one read, plus the checks worked out from it.
    public class Model_Lab_NetworkGraph
    {
        public List<Model_Lab_NetworkNode> Nodes { get; set; } = new();
        public List<Model_Lab_NetworkPort> Ports { get; set; } = new();
        public List<Model_Lab_NetworkLink> Links { get; set; } = new();
        public List<Model_Lab_NetworkZone> Zones { get; set; } = new();
        public List<Model_Lab_NetworkCheck> Checks { get; set; } = new();
    }

    public class Model_Lab_NetworkCheck
    {
        public string Level { get; set; } = "info";        // ok | info | warn
        public string Text { get; set; } = string.Empty;
    }
}
