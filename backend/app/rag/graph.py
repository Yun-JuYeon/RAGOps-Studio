from langgraph.graph import END, StateGraph

from app.rag.nodes.extract_keywords import extract_keywords
from app.rag.nodes.generate import generate
from app.rag.nodes.retrieve import retrieve
from app.rag.state import RagState


def build_rag_graph():
    workflow = StateGraph(RagState)

    workflow.add_node("extract_keywords", extract_keywords)
    workflow.add_node("retrieve", retrieve)
    workflow.add_node("generate", generate)

    workflow.set_entry_point("extract_keywords")
    workflow.add_edge("extract_keywords", "retrieve")
    workflow.add_edge("retrieve", "generate")
    workflow.add_edge("generate", END)

    return workflow.compile()
