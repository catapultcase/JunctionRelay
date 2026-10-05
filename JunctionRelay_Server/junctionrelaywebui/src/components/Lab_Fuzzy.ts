/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024-present Jonathan Mills, CatapultCase
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

// Fuzzy matching for hunting one part in a couple of hundred.
//
// 🔑 EVERY TERM MUST MATCH, each as a SUBSEQUENCE. Two properties come out of that and both
// matter at this size: terms can be typed in any order, so "geekpi panel" and "panel geekpi"
// find the same row; and a term need not be contiguous, so "rckmnt" still reaches "Rack Mount".
//
// ⚠️ Deliberately NOT scored or ranked. The caller keeps its own sort - by type section, or by
// whatever column the user clicked - and re-ordering rows by match quality underneath a chosen
// sort is disorienting. This answers "is this row a match", nothing more.

const normalise = (s: string) => s.toLowerCase().replace(/[\s_\-/(),.]+/g, ' ').trim();

// Is `term` a subsequence of `hay` within a TIGHT window? "rckmnt" should reach
// "rack mount" - that is the point of the fallback - but the first version let the
// subsequence roam the entire record, and ten letters in order somewhere across
// name+spec+vendor+notes is nearly free: searching "CyberPower" matched keystone
// jacks, because c-y-b-e-r-p-o-w-e-r could be stitched across the whole row. The
// window caps the span at 2x the term length, which keeps abbreviations of a word
// or short phrase and kills cross-record letter-stitching.
const subsequence = (hay: string, term: string): boolean => {
    if (!term) return true;
    const maxSpan = Math.max(term.length * 2, term.length + 3);
    for (let start = 0; start <= hay.length - term.length; start++) {
        if (hay[start] !== term[0]) continue;
        let i = 1;
        for (let j = start + 1; j < hay.length && i < term.length && j - start < maxSpan; j++) {
            if (hay[j] === term[i]) i++;
        }
        if (i === term.length) return true;
    }
    return false;
};

export const fuzzyTerms = (query: string): string[] =>
    normalise(query).split(' ').filter(Boolean);

// ⛔ A whole-string subsequence is too loose on its own - a long haystack matches almost any
// short query. Requiring each term to land keeps it useful without being strict about order.
export const fuzzyMatch = (haystack: string, terms: string[]): boolean => {
    if (!terms.length) return true;
    const hay = normalise(haystack);
    return terms.every(t => hay.includes(t) || subsequence(hay, t));
};
