package com.example.dolibarr.dto;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.time.LocalDate;

/**
 * DTO d'échange pour un jour férié (entrée et sortie de l'API REST).
 */
public class JourFerieDto {

    private Long id;

    private String libelle;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
    private LocalDate date;

    public JourFerieDto() {
    }

    public JourFerieDto(Long id, String libelle, LocalDate date) {
        this.id = id;
        this.libelle = libelle;
        this.date = date;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getLibelle() {
        return libelle;
    }

    public void setLibelle(String libelle) {
        this.libelle = libelle;
    }

    public LocalDate getDate() {
        return date;
    }

    public void setDate(LocalDate date) {
        this.date = date;
    }
}
