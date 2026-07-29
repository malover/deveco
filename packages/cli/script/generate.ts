const modelsUrl = process.env.DEVECO_MODELS_URL || "https://models.dev"
const disableModelsFetch = ["true", "1"].includes(
  (process.env.DEVECO_DISABLE_MODELS_FETCH ?? "").toLowerCase(),
)

export const modelsData = disableModelsFetch
  ? "{}"
  : process.env.MODELS_DEV_API_JSON
    ? await Bun.file(process.env.MODELS_DEV_API_JSON).text()
    : await fetch(`${modelsUrl}/api.json`).then((response) => response.text())

if (disableModelsFetch) console.warn("Warning: DEVECO_DISABLE_MODELS_FETCH set, build uses empty models snapshot")
else console.log("Loaded models.dev snapshot")
