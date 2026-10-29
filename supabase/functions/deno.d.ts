// Lo mínimo de la API de Deno que usan las funciones, para poder comprobar los tipos con tsc.
declare const Deno: {
  readonly env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
