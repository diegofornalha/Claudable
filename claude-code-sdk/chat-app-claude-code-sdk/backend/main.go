package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os/exec"
    "time"
)

type ChatRequest struct {
    Message   string `json:"message"`
    SessionID string `json:"sessionId,omitempty"`
}

type ChatResponse struct {
    Success   bool    `json:"success"`
    Message   string  `json:"message"`
    SessionID string  `json:"sessionId,omitempty"`
    Cost      float64 `json:"cost,omitempty"`
    Duration  float64 `json:"duration,omitempty"`
    Turns     int     `json:"turns,omitempty"`
    Error     string  `json:"error,omitempty"`
}

type ClaudeResponse struct {
    Type        string  `json:"type"`
    Subtype     string  `json:"subtype"`
    Result      string  `json:"result"`
    SessionID   string  `json:"session_id"`
    CostUSD     float64 `json:"cost_usd"`
    DurationMS  float64 `json:"duration_ms"`
    NumTurns    int     `json:"num_turns"`
    IsError     bool    `json:"is_error"`
}

func enableCORS(w http.ResponseWriter) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
    w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func chatHandler(w http.ResponseWriter, r *http.Request) {
    enableCORS(w)
    
    if r.Method == "OPTIONS" {
        w.WriteHeader(http.StatusOK)
        return
    }

    if r.Method != "POST" {
        http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
        return
    }

    var req ChatRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    // Build claude command
    args := []string{"-p", req.Message, "--output-format", "json"}
    
    // Add session continuation if sessionID provided
    if req.SessionID != "" {
        args = append(args, "--resume", req.SessionID)
    }

    // Execute claude command
    cmd := exec.Command("claude", args...)
    output, err := cmd.Output()
    
    if err != nil {
        response := ChatResponse{
            Success: false,
            Error:   fmt.Sprintf("Claude command failed: %v", err),
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(response)
        return
    }

    // Parse claude response
    var claudeResp ClaudeResponse
    if err := json.Unmarshal(output, &claudeResp); err != nil {
        response := ChatResponse{
            Success: false,
            Error:   fmt.Sprintf("Failed to parse Claude response: %v", err),
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(response)
        return
    }

    // Build response
    response := ChatResponse{
        Success:   !claudeResp.IsError,
        Message:   claudeResp.Result,
        SessionID: claudeResp.SessionID,
        Cost:      claudeResp.CostUSD,
        Duration:  claudeResp.DurationMS,
        Turns:     claudeResp.NumTurns,
    }

    if claudeResp.IsError {
        response.Error = claudeResp.Result
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
    enableCORS(w)
    
    // Check if claude is available
    cmd := exec.Command("claude", "--version")
    err := cmd.Run()
    
    status := map[string]interface{}{
        "status": "ok",
        "claude_available": err == nil,
        "timestamp": time.Now().Unix(),
    }
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(status)
}

func main() {
    http.HandleFunc("/api/chat", chatHandler)
    http.HandleFunc("/api/health", healthHandler)
    
    fmt.Println("🚀 Server starting on :8080")
    fmt.Println("📋 Endpoints:")
    fmt.Println("  POST /api/chat - Send chat message")
    fmt.Println("  GET  /api/health - Health check")
    
    log.Fatal(http.ListenAndServe(":8080", nil))
}