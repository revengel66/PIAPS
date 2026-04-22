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

    @Column(nullable = false, length = 64)
    private String lastName;

    @Column(nullable = false, length = 64)
    private String firstName;

    @Column(length = 64)
    private String middleName;

    @Column(nullable = false, unique = true, length = 32)
    private String recordBook;

    @Column(nullable = false)
    private Integer course;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StudentStatus status;

    private LocalDate birthDate;

    @Column(length = 32)
    private String phone;

    @Column(length = 128)
    private String email;

    @Column(name = "education_form", length = 32)
    private String educationForm;

    @Column(name = "education_base", length = 32)
    private String educationBase;

    @Column(name = "study_contract_number", unique = true, length = 64)
    private String studyContractNumber;

    @Column(name = "study_start_date")
    private LocalDate studyStartDate;

    @Column(name = "has_academic_debts")
    private Boolean hasAcademicDebts;

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

}
