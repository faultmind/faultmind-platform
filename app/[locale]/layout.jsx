import "../styles/globals.css"; // or "./globals.css" depending on your repo structure

export const metadata = {
  title: "FaultMind - Industrial Diagnostics & AI Troubleshooting",
  description: "AI-powered root-cause analysis and manual lookups for automation and electrical engineers.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: "#0B0F19" }}>
        {children}
      </body>
    </html>
  );
}
