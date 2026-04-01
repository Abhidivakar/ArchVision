# ArchVision 🌌

**ArchVision** is a high-performance, AI-native cloud architecture analyzer and interactive diagram builder. Powered by **Gemini 2.5 Flash/Pro**, it bridges the gap between static diagrams and actionable infrastructure code, enabling seamless cross-cloud migrations and deep technical insights.

![ArchVision Dashboard](https://raw.githubusercontent.com/Abhidivakar/ArchVision/main/docs/dashboard_preview.png)

## 🚀 Key Features

- **🧠 Multi-Cloud Detection (Gemini 2.5)**: Instantly identify GCP, AWS, and Azure components from raw images or manual sketches.
- **🔄 Cross-Cloud Migration**: One-click diagram conversion between providers (e.g., AWS to GCP) with automated terminology and icon translation.
- **🎨 Interactive Draw.io Editor**: A unified, premium building environment for designing complex cloud topologies with real-time feedback.
- **📈 Infrastructure Analysis**: Automated cost estimation, security compliance checks, and performance bottleneck identification.
- **🛠️ Zero-Config Backend**: Now fully unified into a single **Next.js 15** application—no external server required.
- **📄 Professional Exports**: Native DOCX documentation and high-resolution PNG exports for stakeholder presentations.

## 🛠️ Modern Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router & Server Actions)
- **Runtime**: Node.js 20+
- **Frontend**: React 19, TypeScript, Tailwind CSS
- **AI Engine**: [Vertex AI / Gemini 2.5 Flash & Pro](https://cloud.google.com/vertex-ai)
- **Graphics**: Draw.io (mxGraph) Integration
- **Animation**: Framer Motion

## 🏃 Getting Started

### 1. Environment Configuration
Create a `.env` file in the root directory and configure your Google Cloud credentials:

```env
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
GEMINI_MODEL=gemini-2.5-flash
# Optional: Service Account JSON as a string
GCP_SERVICE_ACCOUNT_KEY='{"type": "service_account", ...}'
```

### 2. Local Installation
```bash
# Install optimized dependencies
npm install

# Start the development server
npm run dev
```
Explore the dashboard at `http://localhost:3000`.

## 🏗️ Production Build
ArchVision is optimized for high-performance builds. To create a production-ready package:
```bash
npm run build
npm start
```

---

Built with ❤️ by Abhishek Divakar.
🎨 Optimized for the future of cloud architecture.
