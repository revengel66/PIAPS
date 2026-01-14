package ru.university.piaps.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
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
@Table(name = "orders")
public class OrderDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String number;

    @Column(nullable = false)
    private LocalDate orderDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderType type;

    @Column(nullable = false, length = 4000)
    private String text;

    private LocalDate signDate;
    private String signerPosition;
    private String signerName;

    @Column(length = 2000)
    private String studentsList;

    private LocalDate periodStart;
    private LocalDate periodEnd;
    private String basis;

    private String directionName;
    private String groupCode;
    private String educationForm;
    private String educationBase;
    private String costInfo;

    private LocalDate expelDate;
    private String contractInfo;

    private String oldDirection;
    private String oldGroup;
    private String newDirection;
    private String newGroup;
    private Integer previousCourse;
    private Integer nextCourse;
}
