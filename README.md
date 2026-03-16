# ArchVision 🌌

**ArchVision** is an AI-powered cloud architecture analyzer and traffic simulation engine. Transform your architecture diagrams (images) into interactive, data-driven dashboards with native Next.js API Routes.

![ArchVision Dashboard](https://raw.githubusercontent.com/Abhidivakar/ArchVision/main/docs/dashboard_preview.png)

## 🚀 Key Features

- **🧠 AI-Architecture Discovery**: Instantly detects cloud components and connections from diagrams using Gemini AI.
- **📈 Traffic Simulation Engine**: Simulate real-world workloads and visualize infrastructure scaling, bottlenecks, and costs.
- **🌡️ Latency Heatmaps**: Dynamic hotspots that change color based on predicted performance tiers.
- **🏢 Infrastructure Insights**: Right-sizing recommendations, regional cost splits, and actionable optimization strategies.
- **📄 Professional Exports**: Generate professional Word/DOCX architecture documents natively.
- **✨ Unified Backend**: Now fully integrated into Next.js—deploy once to Netlify and it "just works."

## 🛠️ Tech Stack

- **Frontend/API**: Next.js 14 (App Router), TypeScript, Tailwind CSS, docx.
- **AI**: Google Generative AI Node SDK (Gemini 1.5 Flash).
- **Styling**: Sleek Glassmorphism with Framer Motion.
- **Deployment**: Optimized for **Netlify** (All-in-one).

## 🏃 Local Development

### 1. Environment Setup
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Install & Run
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```
Navigate to `http://localhost:3000`.

---

## 🌐 Deployment (Netlify)

ArchVision is now optimized for a **single-click deployment** on Netlify.

1. **Push to GitHub**: Connect your repository to Netlify.
2. **Environment Variables**: In the Netlify Dashboard, add:
   - `GEMINI_API_KEY`: Your Google AI Studio API key.
3. **Build Settings**:
   - Build Command: `npm run build`
   - Publish Directory: `.next`
4. **Proxy**: The app no longer requires a separate Python backend for deployment!

---

## 🐍 Legacy Python Backend (Optional)
The original `main.py` is preserved for users who prefer a standalone Python FastAPI server.

```bash
# Setup venv
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Run
python main.py
```

---

Built with ❤️ by Abhishek Divakar.
