import SessionRestore from "./session-restore";

export default function OwnerNotFound() {
  return (
    <div
      style={{
        fontFamily:
          "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "inherit",
      }}
    >
      <SessionRestore />
      <div style={{ display: "flex", alignItems: "center" }}>
        <h1
          style={{
            display: "inline-block",
            margin: "0 20px 0 0",
            padding: "0 23px 0 0",
            fontSize: 24,
            fontWeight: 500,
            verticalAlign: "top",
            lineHeight: "49px",
            borderRight: "1px solid rgba(128,128,128,0.4)",
          }}
        >
          404
        </h1>
        <div style={{ fontSize: 14, lineHeight: "49px" }}>
          This page could not be found.
        </div>
      </div>
    </div>
  );
}
