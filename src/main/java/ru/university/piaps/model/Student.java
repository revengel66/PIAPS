package ru.university.piaps.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "students")
public class Student {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String lastName;

    @Column(nullable = false)
    private String firstName;

    private String middleName;

    @Column(nullable = false, unique = true)
    private String recordBook;

    @Column(nullable = false)
    private Integer course;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StudentStatus status;

    private LocalDate birthDate;

    private String phone;

    private String email;

    @Column(name = "enrollment_date")
    private LocalDate enrollmentDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id")
    private StudentGroup group;

    @Transient
    public String getFullName() {
        StringBuilder builder = new StringBuilder();
        builder.append(lastName).append(" ").append(firstName);
        if (middleName != null && !middleName.isBlank()) {
            builder.append(" ").append(middleName);
        }
        return builder.toString();
    }

    @PrePersist
    public void ensureEnrollmentDate() {
        if (enrollmentDate == null) {
            enrollmentDate = LocalDate.now();
        }
    }
}
