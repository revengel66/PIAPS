package ru.university.piaps.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import ru.university.piaps.dto.CurriculumDto;
import ru.university.piaps.service.CurriculumService;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/curriculums")
public class CurriculumController {

    private final CurriculumService curriculumService;

    @GetMapping
    public List<CurriculumDto> findAll(@RequestParam(required = false) Long directionId) {
        return curriculumService.findAll(directionId);
    }
}
