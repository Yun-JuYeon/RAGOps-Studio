"""LangGraph 와이어링.

3-노드 RAG 파이프라인:

    extract_keywords → retrieve → generate

각 노드의 구현은 `app.rag.nodes.*` 에 분리되어 있다. 이 파일은 그래프 구조 정의만
담당한다. 새 노드(rerank, guardrail, multi_query 등)를 추가할 때도 노드 파일만
만들고 여기서 add_node + add_edge 만 추가하면 된다.
"""

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
