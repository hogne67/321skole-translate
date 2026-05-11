import React from "react";

export const btnStyle: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.16)",
    borderRadius: 10,
    padding: "8px 12px",
    background: "white",
    cursor: "pointer",
};

export const softBlueButtonStyle: React.CSSProperties = {
    ...btnStyle,
    background: "rgba(59,130,246,0.08)",
    border: "1px solid rgba(59,130,246,0.22)",
    color: "rgba(30,64,175,1)",
    fontWeight: 800,
};

export const blueButtonActiveStyle: React.CSSProperties = {
    ...btnStyle,
    background: "rgba(59,130,246,0.18)",
    border: "1px solid rgba(59,130,246,0.42)",
    color: "rgba(30,64,175,1)",
    fontWeight: 900,
};

export const playButtonStyle: React.CSSProperties = {
    ...btnStyle,
    background: "rgba(34,197,94,0.14)",
    border: "1px solid rgba(34,197,94,0.40)",
    color: "rgba(21,128,61,1)",
    fontWeight: 900,
};

export const pauseButtonStyle: React.CSSProperties = {
    ...btnStyle,
    background: "rgba(250,204,21,0.20)",
    border: "1px solid rgba(234,179,8,0.42)",
    color: "rgba(161,98,7,1)",
    fontWeight: 900,
};

export const stopButtonStyle: React.CSSProperties = {
    ...btnStyle,
    background: "rgba(239,68,68,0.14)",
    border: "1px solid rgba(239,68,68,0.38)",
    color: "rgba(185,28,28,1)",
    fontWeight: 900,
};

export const primarySubmitStyle: React.CSSProperties = {
    ...btnStyle,
    background: "rgba(16,185,129,1)",
    border: "1px solid rgba(16,185,129,1)",
    color: "white",
    padding: "12px 16px",
    borderRadius: 12,
    fontWeight: 900,
    fontSize: 15,
};

export const primarySubmitStyleDisabled: React.CSSProperties = {
    ...primarySubmitStyle,
    opacity: 0.65,
    cursor: "not-allowed",
};