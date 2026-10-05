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
    // What a de-duplication actually moved. Merging deletes a row, so the caller has to be
    // able to say what survived it - "merged" alone is not reportable, and an assistant that
    // cannot name what it carried over cannot be checked. Every count is rows re-pointed at
    // the keeper, except the two Dropped fields, which are rows deliberately discarded as
    // redundant (a file already attached to the keeper by hash; a rack slot the keeper
    // already occupies).
    public class Model_Lab_MergeResult
    {
        public int AttachmentsMoved { get; set; }
        public int AttachmentsDropped { get; set; }
        public int MarketValuesMoved { get; set; }
        public int MovementsMoved { get; set; }
        public int ChildrenReparented { get; set; }
        public int SpacesRepointed { get; set; }
        public int PlacementsMoved { get; set; }
        public int PlacementsDropped { get; set; }

        // Set only when the keeper actually took the duplicate's machine, so the caller
        // reports an adoption that happened rather than one it merely intended.
        public int? AdoptedMachineId { get; set; }
    }
}
