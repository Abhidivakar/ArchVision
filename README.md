# ArchVision 🌌

**ArchVision** is an AI-powered cloud architecture analyzer and traffic simulation engine. Upload your architecture diagrams (images) or Word documents, and let AI transform them into interactive, data-driven insights.

![ArchVision Dashboard](C:\Users\abhis\.gemini\antigravity\brain\8becf4ae-90da-4958-b45f-0a81b84579b5\clean_simulation_report_top_1773663344712.png)

## 🚀 Key Features

- **🧠 AI-Architecture Discovery**: Instantly detects cloud components, services, and connections from any diagram image using Gemini 2.5 Flash.
- **📈 Traffic Simulation Engine (v2.0)**: Simulate real-world workloads (RPS) and see how your infrastructure scales, where it breaks, and what it will cost.
- **🌡️ Latency Heatmaps**: Dynamic hotspots that change color (Green/Yellow/Red) based on predicted service performance tiers.
- **🏢 Infrastructure Logic**:
  * **Right-Sizing**: Specific instance upgrade/downgrade recommendations.
  * **Regional Splits**: granular cost analysis for Multi-Region deployments.
  * **Bottleneck Linking**: Click a report warning to highlight the specific component on your map.
- **📄 Professional Exports**: Export your full analysis and simulation data to high-quality **PDF reports** or raw **CSV data**.
- **✨ Futuristic UI**: A high-performance dashboard built with Next.js 14, Tailwind CSS, and sleek glassmorphism aesthetics.

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion.
- **Backend**: FastAPI (Python), Google Generative AI (Gemini), Uvicorn.
- **Deployment**: Optimized for Netlify (Frontend) and Cloud Run/Railway (Backend).

## 🏃 Local Development

### 1. Backend Setup (FastAPI)

```bash
# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the backend
python main.py
```

The backend will run on `http://localhost:8000`.

### 2. Frontend Setup (Next.js)

```bash
# Install dependencies
npm install

# Build environment (Create .env from .env.example)
# Add your GOOGLE_API_KEY

# Start dev server
npm run dev
```

The application will be available at `http://localhost:3000`.

## 🌐 Deployment

### Frontend (Netlify)

1. Push your code to GitHub.
2. Connect the repository to Netlify.
3. Set the following Environment Variables in the Netlify Dashboard:
   * `BACKEND_URL`: The URL of your deployed Python backend.

### Backend (Cloud Run / Railway / Render)

1. Deploy the `main.py` using your preferred Python host.
2. Ensure you provide the `GOOGLE_API_KEY` in the environment.
3. The backend is configured to bind to the `$PORT` environment variable automatically.

## 📋 Environment Variables

Create a `.env` file in the root directory:

```env
GOOGLE_API_KEY=your_gemini_api_key_here
BACKEND_URL=http://localhost:8000
```

---

Built with ❤️ by the Abhishek Divakar.
