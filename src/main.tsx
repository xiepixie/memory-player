import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

import ReactDOM from "react-dom/client";
import "./index.css";
import "katex/dist/katex.min.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
