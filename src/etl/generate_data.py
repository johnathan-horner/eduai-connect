import random
import json
from faker import Faker

fake = Faker()
random.seed(42)

NUM_STUDENTS = 75
COURSE_IDS = [101,102,103,104,105,106,107,108]  # 8 courses

students = []

for i in range(1001, 1001 + NUM_STUDENTS):
    first = fake.first_name()
    last = fake.last_name()

    # Each student takes 4–6 courses
    student_courses = random.sample(COURSE_IDS, k=random.randint(4,6))

    enrollments = []
    for course_id in student_courses:
        score = round(random.uniform(65, 98), 1)

        # Simple grade logic
        if score >= 90:
            letter = "A"
        elif score >= 80:
            letter = "B"
        elif score >= 70:
            letter = "C"
        else:
            letter = "D"

        enrollments.append({
            "course_id": course_id,
            "role": "StudentEnrollment",
            "type": "student",
            "enrollment_state": "active",
            "grades": {
                "current_score": score,
                "current_grade": letter
            }
        })

    student = {
        "id": i,
        "name": f"{first} {last}",
        "sortable_name": f"{last}, {first}",
        "short_name": first,
        "login_id": f"{first.lower()}{i}",
        "sis_user_id": f"STU{i}",
        "grade_level": random.randint(9,12),  # K-12 context
        "attendance_rate": round(random.uniform(0.75, 1.0), 2),
        "engagement_score": random.randint(50,100),
        "enrollments": enrollments
    }

    students.append(student)

# Save file
with open("data/students.json", "w") as f:
    json.dump(students, f, indent=2)

print("Generated", len(students), "students")


course_list =[]

COURSE_INFO = [
    (101, "Math", "MATH101"),
    (102, "Biology", "BIO101"),
    (103, "English", "ENG101"),
    (104, "History", "HIST101"),
    (105, "Physics", "PHYS101"),
    (106, "Chemistry", "CHEM101"),
    (107, "Spanish", "SPAN101"),
    (108, "Art", "ART101"),
]

for course_id, course_name, course_code in COURSE_INFO:
    course = {
        "id": course_id,
        "course_code": course_code,
        "name": course_name,
        "start_date": "2024-09-01",
        "end_date": "2024-12-15",
        "instructor": fake.name(),
        "number_of_students": random.randint(15, 35)
    }
    course_list.append(course)

with open("data/courses.json", "w") as f:
    json.dump(course_list, f, indent=2)

print("Generated", len(course_list), "courses")


assignments = []

assignments_info = [
    (201, 101, "Algebra Homework", "2024-09-15", 90),
    (202, 101, "Geometry Project", "2024-10-01", 75),
    (203, 102, "Earth Biology Science Report", "2024-09-20", 50),
    (204, 102, "Biology Quiz", "2024-10-05", 50),
    (205, 103, "Essay on Shakespeare", "2024-09-25", 100),
    (206, 104, "World War II Essay", "2024-10-10", 100),
    (207, 105, "Physics Lab Report", "2024-10-15", 85),
    (208, 106, "Chemistry Lab Report", "2024-10-20", 50),
    (209, 107, "Spanish Conversation Practice", "2024-10-25", 50),
    (210, 108, "Art Portfolio Review", "2024-11-30", 65),
    (211, 101, "Trigonometry Quiz", "2024-11-01", 60),
    (212, 102, "Ecology Project", "2024-11-05", 75),
    (213, 103, "Poetry Analysis", "2024-11-10", 80),
    (214, 104, "Civil Rights Movement Essay", "2024-11-15", 95),
    (215, 105, "Optics Lab Report", "2024-11-20", 55),
    (216, 106, "Organic Chemistry Quiz", "2024-11-25", 50),
    (217, 107, "Spanish Culture Presentation", "2024-11-30", 70),
    (218, 108, "Art History Essay", "2024-12-05", 75),
    (219, 101, "Calculus Final Exam", "2024-12-10", 95),   
    (220, 102, "Genetics Final Exam", "2024-12-15", 50),
    (221, 103, "Literature Final Exam", "2024-12-20", 55),
    (222, 104, "History Final Exam", "2024-12-25", 100),
    (223, 105, "Physics Final Exam", "2024-12-30", 100),
    (224, 106, "Chemistry Final Exam", "2025-01-05", 85),
    (225, 107, "Spanish Final Exam", "2025-01-10", 100),
    (226, 108, "Art Final Project", "2025-01-15", 100),     
    (227, 101, "Statistics Project", "2024-12-01", 80),
    (228, 102, "Microbiology Lab Report", "2024-12-05", 60),
    (229, 103, "Creative Writing Assignment", "2024-12-10", 70),
    (230, 104, "Cold War Essay", "2024-12-15", 85),
    (231, 105, "Thermodynamics Quiz", "2024-12-20", 50),
    (232, 106, "Inorganic Chemistry Project", "2024-12-25", 75),
    (233, 107, "Spanish Literature Analysis", "2024-12-30", 80),
    (234, 108, "Modern Art Presentation", "2025-01-05", 100)

]

for assignment_id, course_id, name, due_date, points_possible in assignments_info:
    assignment = {
        "id": assignment_id,
        "course_id": course_id,
        "name": name,
        "due_date": due_date,
        "points_possible": points_possible
    }
    assignments.append(assignment)

with open("data/assignments.json", "w") as f:
    json.dump(assignments, f, indent=2)

print("Generated", len(assignments), "assignments")

submissions = []

submission_id = 3001
for student in students:
    for enrollment in student["enrollments"]:
        course_id = enrollment["course_id"]
        student_id = student["id"]

        # Get assignments for this course
        course_assignments = [a for a in assignments if a["course_id"] == course_id]

        for assignment in course_assignments:
            # 80% chance the student submitted
            if random.random() < 0.8:
                score = round(random.uniform(50, assignment["points_possible"]), 1)
                submission = {
                    "id": submission_id,
                    "assignment_id": assignment["id"],
                    "student_id": student_id,
                    "score": score,
                    "submitted_at": fake.date_time_between(start_date="-3M", end_date="now").isoformat()
                }
                submissions.append(submission)
                submission_id += 1
with open("data/submissions.json", "w") as f:
    json.dump(submissions, f, indent=2) 

    print("Generated", len(submissions), "submissions")