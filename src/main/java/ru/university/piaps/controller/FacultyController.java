package ru.university.piaps.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import ru.university.piaps.dto.FacultyDeleteTransferRequest;
import ru.university.piaps.dto.FacultyDto;
import ru.university.piaps.service.FacultyService;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/faculties")
public class FacultyController {

    private final FacultyService facultyService;

    @GetMapping
    public List<FacultyDto> findAll() {
        return facultyService.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FacultyDto create(@RequestBody @Valid FacultyDto request) {
        return facultyService.create(request);
    }

    @PutMapping("/{id}")
    public FacultyDto update(@PathVariable Long id, @RequestBody @Valid FacultyDto request) {
        return facultyService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        facultyService.delete(id);
    }

    @PostMapping("/{id}/delete-with-transfer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteWithTransfer(@PathVariable Long id, @RequestBody FacultyDeleteTransferRequest request) {
        facultyService.deleteWithTransfer(id, request);
    }
}
