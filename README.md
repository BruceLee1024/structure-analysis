# 结构大师 - 智能结构求解器

基于矩阵位移法的 2D 结构分析工具，支持多种结构类型的参数化建模和有限元分析。

## ⚠️ 免责声明

**本项目仅供参考、学习使用，不可用于实际工程项目设计。**

## 在线演示

访问：https://brucelee1024.github.io/structure-analysis/

## 功能特点

- 🏗️ 多种结构类型：门式刚架、悬臂刚架、人字形刚架、多层框架、桁架等
- 📐 参数化建模：通过滑块快速调整结构尺寸和材料参数
- 🔧 自定义编辑：节点、单元、荷载的可视化编辑
- 📊 实时分析：矩阵位移法求解，显示弯矩图、剪力图和变形
- 🎨 现代界面：深色主题，响应式设计

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
