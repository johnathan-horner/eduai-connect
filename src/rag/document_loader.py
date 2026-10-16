from langchain_core.documents import Document
import json

# Load student data from our synthetic Canvas API-formatted JSON
with open("data/students.json", "r") as f:
    students = json.load(f)

# Load course data to enrich student documents with course names
with open("data/courses.json", "r") as f:
    courses = json.load(f)

def load_documents():
    """
    Converts raw student JSON data into LangChain Document objects.
    Each student becomes one Document with their info as page_content
    and their ID as metadata for filtering later.
    This is the first step in the RAG pipeline — the data ingestion layer.
    """
    documents = []

    # Loop through every student and build a text representation
    for student in students:
        # Build the page_content string — this is what the LLM will search through
        page_content = f"Student Name: {student['name']}\n"
        page_content += f"Grade Level: {student['grade_level']}\n"
        page_content += f"Attendance Rate: {student['attendance_rate']}\n"
        page_content += f"Engagement Score: {student['engagement_score']}\n"
        page_content += "Enrollments:\n"

        # Add each course enrollment with grades — this lets the AI
        # answer questions like "who is failing Biology?"
        for enrollment in student['enrollments']:
            # Match course ID to course name from courses.json
            course_info = next((c for c in courses if c['id'] == enrollment['course_id']), None)
            if course_info:
                page_content += f"  - Course: {course_info['name']} (ID: {course_info['id']})\n"
                page_content += f"    Role: {enrollment['role']}\n"
                page_content += f"    Enrollment State: {enrollment['enrollment_state']}\n"
                page_content += f"    Current Score: {enrollment['grades']['current_score']}\n"
                page_content += f"    Current Grade: {enrollment['grades']['current_grade']}\n"

        # Create a LangChain Document object
        # page_content = the text the AI searches through
        # metadata = used for filtering (e.g., find docs for a specific student)
        doc = Document(
            page_content=page_content,
            metadata={"source": f"student_{student['id']}"}
        )
        documents.append(doc)

    print(f"Loaded {len(documents)} documents")
    return documents