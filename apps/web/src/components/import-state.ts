import type { FormState } from "./form-state";

export interface ImportSampleRow {
  readonly date: string;
  readonly description: string;
  /** Importe con signo en unidades mínimas (texto: bigint). */
  readonly minor: string;
  readonly currency: string;
  readonly category: string | null;
}

export interface ImportPreview {
  readonly batchId: string;
  readonly alreadyImported: boolean;
  readonly newCount: number;
  readonly duplicateCount: number;
  readonly errorCount: number;
  /** Traspasos entre cuentas propias y redondeos que se dejan fuera. */
  readonly internal: number;
  /** Movimientos retenidos (aún sin liquidar) que se dejan fuera. */
  readonly pending: number;
  readonly unreadable: number;
  readonly from: string | null;
  readonly to: string | null;
  readonly sample: readonly ImportSampleRow[];
}

/** Estado de la pantalla de importar: vista previa, importación hecha o deshecha. */
export interface ImportState extends FormState {
  readonly preview?: ImportPreview;
  readonly done?: { readonly imported: number; readonly batchId: string };
  readonly undone?: boolean;
  readonly discarded?: boolean;
}
