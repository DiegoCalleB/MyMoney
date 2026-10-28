import { describe, expect, it } from "vitest";
import { createShakeDetector } from "@/lib/shake";

const still = { x: 0, y: 0, z: 9.81 };
const hit = { x: 18, y: 12, z: 14 }; // módulo ≈ 26 m/s²

function run(samples: [number, { x: number; y: number; z: number }][]): boolean[] {
  const detect = createShakeDetector();
  return samples.map(([t, s]) => detect(s, t));
}

describe("createShakeDetector", () => {
  it("el móvil quieto o caminando no activa nada", () => {
    expect(
      run([
        [0, still],
        [16, still],
        [32, { x: 1, y: 2, z: 12 }],
        [500, { x: 3, y: 2, z: 15 }],
      ]),
    ).toEqual([false, false, false, false]);
  });

  it("tres sacudones seguidos activan, y solo una vez por agitada", () => {
    const out = run([
      [0, hit],
      [150, hit],
      [300, hit],
      [350, hit],
      [450, hit],
    ]);
    expect(out).toEqual([false, false, true, false, false]);
  });

  it("varias lecturas seguidas del mismo golpe cuentan como uno", () => {
    expect(
      run([
        [0, hit],
        [16, hit],
        [32, hit],
        [48, hit],
        [64, hit],
      ]),
    ).toEqual([false, false, false, false, false]);
  });

  it("sacudones muy espaciados no suman", () => {
    expect(
      run([
        [0, hit],
        [700, hit],
        [1400, hit],
        [2100, hit],
      ]),
    ).toEqual([false, false, false, false]);
  });

  it("vuelve a funcionar pasada la pausa", () => {
    const out = run([
      [0, hit],
      [150, hit],
      [300, hit], // activa
      [2000, hit],
      [2150, hit],
      [2300, hit], // otra agitada tras la pausa
    ]);
    expect(out).toEqual([false, false, true, false, false, true]);
  });

  it("un golpe por debajo del umbral no cuenta", () => {
    const soft = { x: 0, y: 0, z: 19 }; // 9,2 m/s² por encima de 1 g
    expect(
      run([
        [0, soft],
        [150, soft],
        [300, soft],
        [450, soft],
      ]),
    ).toEqual([false, false, false, false]);
  });
});
