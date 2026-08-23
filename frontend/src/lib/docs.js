/* The export document engine — the front door.

   What was one very long file is now a folder: lib/docs/common.js holds the
   engine every document is built out of, lib/docs/docNN.js holds one document
   each, and lib/docs/index.js gathers them into the registry the app asks by
   number. This file re-exports that index, so everything importing "./docs.js"
   goes on working unchanged. */
export * from "./docs/index.js";
