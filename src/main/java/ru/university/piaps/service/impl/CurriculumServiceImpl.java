package ru.university.piaps.service.impl;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import ru.university.piaps.dto.CurriculumDto;
import ru.university.piaps.model.Curriculum;
import ru.university.piaps.repository.CurriculumRepository;
import ru.university.piaps.service.CurriculumService;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CurriculumServiceImpl implements CurriculumService {

    private final CurriculumRepository curriculumRepository;

    @Override
    @Transactional(readOnly = true)
    public List<CurriculumDto> findAll(Long directionId) {
        List<Curriculum> source = directionId == null
                ? curriculumRepository.findAll()
                : curriculumRepository.findAllByDirectionId(directionId);
        return source.stream()
                .map(this::toDto)
                .toList();
    }

    private CurriculumDto toDto(Curriculum curriculum) {
        Long facultyId = curriculum.getDirection() != null && curriculum.getDirection().getFaculty() != null
                ? curriculum.getDirection().getFaculty().getId()
                : null;
        String facultyName = curriculum.getDirection() != null && curriculum.getDirection().getFaculty() != null
                ? curriculum.getDirection().getFaculty().getName()
                : null;
        return CurriculumDto.builder()
                .id(curriculum.getId())
                .course(curriculum.getCourse())
                .semester(curriculum.getSemester())
                .discipline(curriculum.getDiscipline())
                .hours(curriculum.getHours())
                .attestation(curriculum.getAttestation())
                .courseWork(Boolean.TRUE.equals(curriculum.getCourseWork()))
                .educationLevel(curriculum.getEducationLevel())
                .educationForm(curriculum.getEducationForm())
                .accelerated(Boolean.TRUE.equals(curriculum.getAccelerated()))
                .planYear(curriculum.getPlanYear())
                .directionId(curriculum.getDirection() != null ? curriculum.getDirection().getId() : null)
                .directionName(curriculum.getDirection() != null ? curriculum.getDirection().getName() : null)
                .facultyId(facultyId)
                .facultyName(facultyName)
                .build();
    }
}
