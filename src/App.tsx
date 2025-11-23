import { Layout } from "./components/Layout";
import { AuthGate } from "./components/AuthGate";

function App() {
  return (
    <AuthGate>
      <Layout />
    </AuthGate>
  );
}

export default App;
