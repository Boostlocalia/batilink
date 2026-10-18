import { describe, expect, it } from "vitest";

import {
  MAX_IMPORTED_ITEMS,
  parseCsv,
  rowsToItems,
  spreadsheetKind,
  toQuantity,
  toUnit,
} from "../spreadsheet";

describe("spreadsheetKind", () => {
  it("reads the extension or the type", () => {
    expect(spreadsheetKind("Métré.XLSX")).toBe("xlsx");
    expect(spreadsheetKind("liste.csv")).toBe("csv");
    expect(spreadsheetKind("export", "text/comma-separated-values")).toBe(
      "csv",
    );
    expect(spreadsheetKind("ancien.xls")).toBe("xls");
    expect(spreadsheetKind("plan.pdf", "application/pdf")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("reads Belgian Excel CSV with semicolons and quotes", () => {
    const csv =
      '﻿Désignation;Quantité;Unité\r\n"Ciment; CEM II";"1.250,5";sac\r\n\r\nBloc béton 14;300;pc\r\n';
    expect(parseCsv(csv)).toEqual([
      ["Désignation", "Quantité", "Unité"],
      ["Ciment; CEM II", "1.250,5", "sac"],
      ["Bloc béton 14", "300", "pc"],
    ]);
  });

  it("reads commas and escaped quotes", () => {
    expect(parseCsv('label,qty\n"Tube 3""",4')).toEqual([
      ["label", "qty"],
      ['Tube 3"', "4"],
    ]);
  });
});

describe("quantities and units", () => {
  it("understands Belgian and plain numbers", () => {
    expect(toQuantity("1.250,5")).toBe("1250.5");
    expect(toQuantity("12,75")).toBe("12.75");
    expect(toQuantity(3)).toBe("3");
    expect(toQuantity("")).toBe("");
    expect(toQuantity("total")).toBe("");
    expect(toQuantity(0)).toBe("");
  });

  it("maps French and Dutch units", () => {
    expect(toUnit("Sac")).toBe("bag");
    expect(toUnit("zakken")).toBe("bag");
    expect(toUnit("m²")).toBe("m2");
    expect(toUnit("M3")).toBe("m3");
    expect(toUnit("st.")).toBe("piece");
    expect(toUnit("palette")).toBe("pallet");
    expect(toUnit("boîte")).toBe("piece");
  });
});

describe("rowsToItems", () => {
  it("finds the header under a title and skips sections and totals", () => {
    const rows = [
      ["Chantier Uccle", null, null, null],
      ["Poste", "Omschrijving", "Eenheid", "Aantal"],
      ["1", "Ruwbouw", null, null],
      ["1.1", "Snelbouwsteen 14 cm", "st", 1200],
      ["1.2", "Cement", "zak", "40"],
      [null, "Totaal", null, null],
    ];
    expect(rowsToItems(rows)).toEqual([
      { label: "Snelbouwsteen 14 cm", quantity: "1200", unit: "piece" },
      { label: "Cement", quantity: "40", unit: "bag" },
    ]);
  });

  it("reads the rows of a real .xlsx metre (as returned by read-excel-file)", () => {
    const rows = [
      ["Métré chantier Uccle", null, null, null, null],
      [null, null, null, null, null],
      ["Poste", "Désignation", "Unité", "Quantité", "Prix"],
      ["1", "Gros œuvre", null, null, null],
      ["1.1", "Bloc béton 14 cm", "pc", 1200, null],
      ["1.2", "Ciment CEM II", "sac", 40.5, null],
      ["1.3", "Sable stabilisé", "m³", "12,5", null],
      [null, "Total", null, null, null],
    ];
    expect(rowsToItems(rows)).toEqual([
      { label: "Bloc béton 14 cm", quantity: "1200", unit: "piece" },
      { label: "Ciment CEM II", quantity: "40.5", unit: "bag" },
      { label: "Sable stabilisé", quantity: "12.5", unit: "m3" },
    ]);
  });

  it("uses label, quantity, unit when there is no header", () => {
    expect(rowsToItems([["Sable", "2,5", "t"]])).toEqual([
      { label: "Sable", quantity: "2.5", unit: "t" },
    ]);
  });

  it("stops at the maximum", () => {
    const rows = Array.from({ length: MAX_IMPORTED_ITEMS + 20 }, (_, i) => [
      `Article ${i}`,
      1,
      "pc",
    ]);
    expect(rowsToItems(rows)).toHaveLength(MAX_IMPORTED_ITEMS);
  });
});
